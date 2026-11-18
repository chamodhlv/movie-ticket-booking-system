// An error that carries an HTTP status code. Anywhere in our code we can write
// `throw new HttpError(404, "Movie not found")` and the error handler below
// turns it into a proper JSON response. (Express 5 forwards errors thrown in
// async handlers automatically, so we don't need try/catch everywhere.)
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
