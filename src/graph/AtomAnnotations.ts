/**
 * AtomAnnotations stores arbitrary per-atom metadata.
 * It mirrors the functionality provided in PIKAChU while
 * exposing a TypeScript-friendly API for SmilesDrawer.
 */
class AtomAnnotations {
  private readonly values: Map<string, unknown>;

  constructor() {
    this.values = new Map();
  }

  /**
   * Clone the annotation container.
   */
  copy(): AtomAnnotations {
    const clone = new AtomAnnotations();
    for (const [key, value] of this.values.entries()) {
      clone.values.set(key, this.cloneValue(value));
    }
    return clone;
  }

  /**
   * Register a new annotation with an optional default value.
   * Throws if the annotation already exists.
   */
  addAnnotation(name: string, defaultValue: unknown = null): void {
    if (this.values.has(name)) {
      throw new Error(`Annotation "${name}" already exists on atom`);
    }
    this.values.set(name, this.cloneValue(defaultValue));
  }

  /**
   * Update an existing annotation value.
   */
  setAnnotation(name: string, value: unknown): void {
    if (!this.values.has(name)) {
      throw new Error(`Annotation "${name}" is not registered on atom`);
    }
    this.values.set(name, this.cloneValue(value));
  }

  /**
   * Retrieve an annotation value.
   */
  getAnnotation<T>(name: string): T | undefined {
    return this.values.get(name) as T | undefined;
  }

  /**
   * Whether an annotation is registered on the atom.
   */
  hasAnnotation(name: string): boolean {
    return this.values.has(name);
  }

  /**
   * Return all annotation names registered for this atom.
   */
  keys(): string[] {
    return Array.from(this.values.keys());
  }

  /**
   * Export annotations as a plain object.
   */
  toJSON(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of this.values.entries()) {
      obj[key] = this.cloneValue(value);
    }
    return obj;
  }

  private cloneValue<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.cloneValue(entry)) as unknown as T;
    }

    return { ...(value as Record<string, unknown>) } as unknown as T;
  }
}

export = AtomAnnotations;
