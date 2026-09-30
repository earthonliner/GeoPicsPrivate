/**
 * pool.js：Web Worker 线程池。任务带优先级（数字越小越先执行），支持取消排队中的任务。
 */

const WORKER_URL = new URL('./workers/render-worker.js', import.meta.url);

export class RenderPool {
  constructor(size) {
    this.slots = [];
    this.queues = [[], [], []];
    this.nextId = 1;
    this.resize(size);
  }

  get size() {
    return this.slots.filter((s) => !s.retire).length;
  }

  resize(n) {
    const target = Math.max(1, n);
    while (this.size < target) {
      const revived = this.slots.find((s) => s.retire);
      if (revived) revived.retire = false;
      else this.slots.push(this.spawn());
    }
    const extra = this.size - target;
    const live = this.slots.filter((s) => !s.retire).reverse();
    for (let i = 0; i < extra; i += 1) live[i].retire = true;
    this.slots = this.slots.filter((s) => {
      if (s.retire && !s.task) {
        s.worker.terminate();
        return false;
      }
      return true;
    });
    this.pump();
  }

  spawn() {
    const worker = new Worker(WORKER_URL, { type: 'module' });
    const slot = { worker, task: null };
    worker.onmessage = (e) => {
      const task = slot.task;
      if (!task || e.data.id !== task.id) return;
      slot.task = null;
      if (e.data.ok) task.resolve(e.data.result);
      else task.reject(Object.assign(new Error(e.data.error), { code: e.data.code }));
      if (slot.retire) {
        worker.terminate();
        this.slots = this.slots.filter((s) => s !== slot);
      }
      this.pump();
    };
    worker.onerror = (e) => {
      const task = slot.task;
      slot.task = null;
      worker.terminate();
      const idx = this.slots.indexOf(slot);
      if (idx >= 0) this.slots[idx] = this.spawn();
      if (task) task.reject(new Error(e.message || 'worker crashed'));
      this.pump();
    };
    return slot;
  }

  /**
   * @param {'render'|'thumb'} type
   * @param {object} payload
   * @param {{priority?: number}} opts 0 最高
   */
  run(type, payload, opts = {}) {
    const priority = Math.min(this.queues.length - 1, Math.max(0, opts.priority ?? 1));
    return new Promise((resolve, reject) => {
      this.queues[priority].push({ id: this.nextId++, type, payload, resolve, reject });
      this.pump();
    });
  }

  pump() {
    for (const slot of this.slots) {
      if (slot.task || slot.retire) continue;
      const queue = this.queues.find((q) => q.length);
      if (!queue) return;
      const task = queue.shift();
      slot.task = task;
      slot.worker.postMessage({ id: task.id, type: task.type, payload: task.payload });
    }
  }

  pending(priority) {
    return this.queues[priority].length;
  }

  cancelPending(priority) {
    const q = this.queues[priority];
    q.splice(0).forEach((t) => t.reject(Object.assign(new Error('cancelled'), { code: 'CANCELLED' })));
  }

  destroy() {
    this.slots.forEach((s) => s.worker.terminate());
    this.slots = [];
  }
}

export function defaultWorkerCount() {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(2, Math.min(6, Math.floor(cores / 2)));
}
