# Pattern annotations

`@pattern` holds a JavaScript regular expression, used in the schema and for validation at runtime. Text after the expression is the custom error message.

```ts
interface Model {
  /** @pattern ^[a-z]+$ Only lowercase letters */
  plain: string;

  /** @pattern `^[a-z ]+$` Only letters and spaces */
  backticks: string;

  /** @pattern /^[a-z ]+$/ Only letters and spaces */
  literal: string;
}

/** @pattern value `^[a-z ]+$` Only letters and spaces */
function validate(value: string) {}
```

A plain pattern ends at the first space, so a pattern that contains a space needs backticks or a `/.../` literal.

- A backtick pair stays on one line. It closes at the first unescaped backtick followed by a space or the end of the comment. `\`` keeps a backtick in the pattern, along with its backslash.
- A `/.../` literal closes at a `/` that is unescaped and outside a character class, followed by a space or the end of the comment. `/api/v[0-9]+ Invalid path` isn't a literal, so its slashes stay in the pattern.

Generation fails with the annotation's location when JavaScript can't compile the expression.
