// Makes text safe to paste INSIDE an HTML e-mail.
//
// Why it matters: the movie title is typed by an admin and the customer's name by the customer.
// If someone registers with the name  <img src=x onerror=...>  and we pasted it into the e-mail
// as-is, the e-mail would contain their HTML. Replacing the five special characters turns it
// into harmless visible text. (React does this automatically on the website; in a hand-built
// HTML string we must do it ourselves.)
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;") // must be first, or we would escape our own "&lt;" etc.
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
