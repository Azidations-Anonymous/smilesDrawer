export {};

declare global {
    interface Array<T> {
        contains(value: T): boolean;
    }
}

Array.prototype.contains = function <T>(this: T[], value: T): boolean {
    return this.some((element) => element === value);
};
