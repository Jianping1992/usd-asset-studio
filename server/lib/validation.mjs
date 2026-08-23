export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function validationError(message, details) {
  return new AppError(400, 'VALIDATION_ERROR', message, details);
}

export function notFound(resource, id) {
  return new AppError(404, 'NOT_FOUND', `${resource} not found`, { id });
}

export function assertPlainObject(value, label = 'Request body') {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw validationError(`${label} must be a JSON object`);
  }
  return value;
}

export function rejectUnknownKeys(value, allowedKeys, label = 'Request body') {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw validationError(`${label} contains unsupported fields`, { fields: unknown });
  }
}

export function requiredString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`, { field });
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw validationError(`${field} must contain ${min}-${max} characters`, { field });
  }
  return normalized;
}

export function optionalString(value, field, { max = 2_000, fallback = '' } = {}) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`, { field });
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw validationError(`${field} cannot exceed ${max} characters`, { field });
  }
  return normalized;
}

export function parseTags(value, field = 'tags') {
  if (value === undefined || value === '') return [];

  let tags = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        tags = JSON.parse(trimmed);
      } catch {
        throw validationError(`${field} must be a JSON array or comma-separated string`, {
          field,
        });
      }
    } else {
      tags = trimmed.split(',');
    }
  }

  if (!Array.isArray(tags) || tags.length > 12) {
    throw validationError(`${field} must be an array containing at most 12 tags`, { field });
  }

  const normalized = tags.map((tag, index) => {
    if (typeof tag !== 'string') {
      throw validationError(`${field}[${index}] must be a string`, { field });
    }
    const item = tag.trim();
    if (!item || item.length > 30) {
      throw validationError(`${field}[${index}] must contain 1-30 characters`, { field });
    }
    return item;
  });

  return [...new Set(normalized)];
}

export function finiteVector(value, field, { positive = false, bounded = true } = {}) {
  let vector = value;
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ['x', 'y', 'z'].every((axis) => Object.hasOwn(value, axis))
  ) {
    vector = [value.x, value.y, value.z];
  }

  if (!Array.isArray(vector) || vector.length !== 3) {
    throw validationError(`${field} must be a three-number array`, { field });
  }

  return vector.map((item, index) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw validationError(`${field}[${index}] must be a finite number`, { field });
    }
    if (positive && (item <= 0 || item > 1_000)) {
      throw validationError(`${field}[${index}] must be greater than 0 and at most 1000`, {
        field,
      });
    }
    if (!positive && bounded && Math.abs(item) > 1_000_000) {
      throw validationError(`${field}[${index}] is outside the supported range`, { field });
    }
    return item;
  });
}

export function parseNonNegativeInteger(value, field, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) {
    throw validationError(`${field} must be a non-negative integer`, { field });
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw validationError(`${field} must be a safe non-negative integer`, { field });
  }
  return number;
}
