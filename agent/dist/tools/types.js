export const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
export const str = (description, extra = {}) => ({ type: "string", description, ...extra });
export const num = (description, extra = {}) => ({ type: "number", description, ...extra });
export const int = (description, extra = {}) => ({ type: "integer", description, ...extra });
export const bool = (description) => ({ type: "boolean", description });
export const arr = (items, description) => ({ type: "array", items, description });
export const enm = (values, description) => ({ type: "string", enum: values, description });
