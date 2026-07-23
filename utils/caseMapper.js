/**
 * Convert between Postgres snake_case rows and API camelCase objects.
 */

const toCamelKey = (key) =>
  key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const toSnakeKey = (key) =>
  key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

const keysToCamel = (input) => {
  if (Array.isArray(input)) return input.map(keysToCamel);
  if (!isPlainObject(input)) return input;

  const out = {};
  for (const [key, value] of Object.entries(input)) {
    out[toCamelKey(key)] = keysToCamel(value);
  }
  return out;
};

const keysToSnake = (input) => {
  if (Array.isArray(input)) return input.map(keysToSnake);
  if (!isPlainObject(input)) return input;

  const out = {};
  for (const [key, value] of Object.entries(input)) {
    // Keep nested JSON payloads as-is when already objects (items, meta, etc.)
    out[toSnakeKey(key)] = isPlainObject(value) || Array.isArray(value)
      ? value
      : keysToSnake(value);
  }
  return out;
};

/** Strip undefined so Supabase update/insert doesn't choke. */
const stripUndefined = (obj) => {
  if (!isPlainObject(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
};

module.exports = {
  toCamelKey,
  toSnakeKey,
  keysToCamel,
  keysToSnake,
  stripUndefined,
};
