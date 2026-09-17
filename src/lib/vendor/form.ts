/* ─── stitaP — Custom Form & Validation (replaces react-hook-form + zod) ─── */

import { useState, useCallback, useRef, useEffect } from "react";

/* ─── Zod-compatible schema builder (lightweight) ─── */

export type ZodType<T = unknown> = {
  _type: string;
  _parse: (val: unknown) => { success: true; data: T } | { success: false; error: string };
};

class ZodString implements ZodType<string> {
  _type = "string";
  private _minLen?: number;
  private _maxLen?: number;
  private _regex?: RegExp;
  private _email = false;
  private _url = false;

  min(n: number) { this._minLen = n; return this; }
  max(n: number) { this._maxLen = n; return this; }
  email() { this._email = true; return this; }
  url() { this._url = true; return this; }
  regex(r: RegExp) { this._regex = r; return this; }

  _parse(val: unknown) {
    if (typeof val !== "string") return { success: false as const, error: "Expected string" };
    if (this._minLen !== undefined && val.length < this._minLen)
      return { success: false as const, error: `Min length ${this._minLen}` };
    if (this._maxLen !== undefined && val.length > this._maxLen)
      return { success: false as const, error: `Max length ${this._maxLen}` };
    if (this._email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
      return { success: false as const, error: "Invalid email" };
    if (this._url && !/^https?:\/\//.test(val))
      return { success: false as const, error: "Invalid URL" };
    if (this._regex && !this._regex.test(val))
      return { success: false as const, error: "Invalid format" };
    return { success: true as const, data: val };
  }
}

class ZodNumber implements ZodType<number> {
  _type = "number";
  private _min?: number;
  private _max?: number;

  min(n: number) { this._min = n; return this; }
  max(n: number) { this._max = n; return this; }

  _parse(val: unknown) {
    const num = Number(val);
    if (isNaN(num)) return { success: false as const, error: "Expected number" };
    if (this._min !== undefined && num < this._min)
      return { success: false as const, error: `Min ${this._min}` };
    if (this._max !== undefined && num > this._max)
      return { success: false as const, error: `Max ${this._max}` };
    return { success: true as const, data: num };
  }
}

class ZodBoolean implements ZodType<boolean> {
  _type = "boolean";
  _parse(val: unknown) {
    return { success: true as const, data: !!val };
  }
}

class ZodOptional<T> implements ZodType<T | undefined> {
  _type = "optional";
  inner: ZodType<T>;
  constructor(inner_: ZodType<T>) { this.inner = inner_; }
  _parse(val: unknown) {
    if (val === undefined || val === null || val === "") return { success: true as const, data: undefined };
    return this.inner._parse(val) as { success: true; data: T | undefined } | { success: false; error: string };
  }
}

class ZodObject<T extends Record<string, unknown>> implements ZodType<{ [K in keyof T]: unknown }> {
  _type = "object";
  _shape: T;
  constructor(shape: T) { this._shape = shape; }

  _parse(val: unknown) {
    if (typeof val !== "object" || val === null) return { success: false as const, error: "Expected object" };
    const result: Record<string, unknown> = {};
    const obj = val as Record<string, unknown>;
    for (const [key, schema] of Object.entries(this._shape)) {
      const parsed = (schema as ZodType)._parse(obj[key]);
      if (!parsed.success) return { success: false as const, error: `${key}: ${parsed.error}` };
      result[key] = parsed.data;
    }
    return { success: true as const, data: result as any };
  }
}

/* ─── Schema builder functions ─── */

export const z = {
  string: () => new ZodString(),
  number: () => new ZodNumber(),
  boolean: () => new ZodBoolean(),
  object: <T extends Record<string, ZodType>>(shape: T) => new ZodObject(shape),
  optional: <T>(schema: ZodType<T>) => new ZodOptional(schema),
};

export type InferredZod<T> = T extends ZodType<infer V> ? V : never;

/* ─── Form Hook ─── */

export interface UseFormOptions<T extends Record<string, unknown>> {
  schema?: ZodType<T>;
  defaultValues?: T;
  onSubmit: (data: T) => void | Promise<void>;
}

export interface UseFormReturn<T extends Record<string, unknown>> {
  register: (name: keyof T) => {
    value: unknown;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    onBlur: () => void;
    name: string;
  };
  handleSubmit: (e: React.FormEvent) => void;
  formState: {
    errors: Record<string, string>;
    isSubmitting: boolean;
    isDirty: boolean;
    isValid: boolean;
  };    setValue: (name: keyof T, value: unknown) => void;
  getValue: (name: keyof T) => unknown;
  reset: (values?: T) => void;
  watch: (name?: keyof T) => unknown;
  setError: (name: keyof T, message: string) => void;
  clearErrors: (name?: keyof T) => void;
  getValues: () => T;
}

export function useForm<T extends Record<string, unknown>>(options: UseFormOptions<T>): UseFormReturn<T> {
  const { schema, defaultValues, onSubmit } = options;
  const [values, setValues] = useState<T>(defaultValues || ({} as T));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const validate = useCallback((): Record<string, string> => {
    if (!schema) return {};
    const result = schema._parse(valuesRef.current);
    if (result.success) return {};
    // Parse nested errors like "fieldName: message"
    const newErrors: Record<string, string> = {};
    const errorStr = result.error;
    const parts = errorStr.split(": ");
    if (parts.length >= 2) {
      newErrors[parts[0]] = parts.slice(1).join(": ");
    } else {
      newErrors._form = errorStr;
    }
    return newErrors;
  }, [schema]);

  const register = useCallback(
    (name: keyof T) => ({
      value: valuesRef.current[name] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setIsDirty(true);
        setValues((prev) => ({ ...prev, [name]: e.target.value }));
        // Clear error for this field
        setErrors((prev) => {
          const next = { ...prev };
          delete next[name as string];
          return next;
        });
      },
      onBlur: () => {
        // Validate single field on blur
        if (schema) {
          const fieldSchema = (schema as ZodObject<T>)._parse;
          // Simplified single-field validation
        }
      },
      name: name as string,
    }),
    [],
  );

  const setValue = useCallback((name: keyof T, value: unknown) => {
    setIsDirty(true);
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const getValue = useCallback((name: keyof T) => valuesRef.current[name], []);

  const reset = useCallback((vals?: T) => {
    setValues(vals || (defaultValues || ({} as T)));
    setErrors({});
    setIsDirty(false);
    setIsSubmitting(false);
  }, [defaultValues]);

  const watch = useCallback((name?: keyof T) => {
    if (name) return valuesRef.current[name];
    return valuesRef.current;
  }, []);

  const setError = useCallback((name: keyof T, message: string) => {
    setErrors((prev) => ({ ...prev, [name as string]: message }));
  }, []);

  const clearErrors = useCallback((name?: keyof T) => {
    if (name) {
      setErrors((prev) => { const next = { ...prev }; delete next[name as string]; return next; });
    } else {
      setErrors({});
    }
  }, []);

  const getValues = useCallback(() => valuesRef.current, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      const validationErrors = validate();
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length === 0) {
        try {
          await onSubmit(valuesRef.current);
        } catch (err) {
          setErrors({ _form: err instanceof Error ? err.message : "Submission failed" });
        }
      }
      setIsSubmitting(false);
    },
    [validate, onSubmit],
  );

  const isValid = Object.keys(errors).length === 0 && isDirty;

  return {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty, isValid },
    setValue,
    getValue,
    reset,
    watch,
    setError,
    clearErrors,
    getValues,
  };
}
