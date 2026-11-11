export { cn } from "cn"

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`
export const signed =(n: number, digits = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`
