/**
 * filename.js：导出文件名生成（去扩展名、清理非法字符、同名自动加序号）。
 */

export function baseName(fileName) {
  const name = String(fileName || 'photo').replace(/^.*[\\/]/, '');
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function sanitize(name) {
  return String(name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120) || 'photo';
}

/**
 * 文件名模板：{name} 原文件名，{place} 地名，{date} 日期（YYYYMMDD），{template} 模板 id，{index} 序号（从 1 开始）
 */
export function renderNamePattern(pattern, vars) {
  const out = String(pattern || '{name}_geo').replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all));
  return sanitize(out);
}

export function createNamer() {
  const used = new Map();
  return (base, ext) => {
    const key = `${base}.${ext}`.toLowerCase();
    const n = used.get(key) || 0;
    used.set(key, n + 1);
    return n === 0 ? `${base}.${ext}` : `${base}-${n + 1}.${ext}`;
  };
}

/** "2024-06-16" -> "20240616"（用于文件名），无法解析返回 "nodate" */
export function formatDateForFile(dateValue) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
  return m ? `${m[1]}${m[2]}${m[3]}` : 'nodate';
}
