// Users type search text, and characters like ( or * have special meaning in a regex.
// Escaping them means a search for "Mr. (Bean)" is treated as plain text.
export function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
