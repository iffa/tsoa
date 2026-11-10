# Faster generation with tsrs

Most of generation goes to TypeScript inferring types through function bodies. Install [tsrs](https://github.com/oxc-project/tsrs) next to tsoa and the CLI uses it automatically. tsrs writes declarations for the files your controllers' types reach, and tsoa reads those instead of the sources.

```bash
yarn add -D tsrs@0.21.0-ts7.1.0-beta
```

On a project with 267 controllers and 1712 routes, this took generation from 11.2s to 4.7s and peak memory from 2.0GB to 1.0GB.

tsoa keeps reading the source of:

- files with classes or decorators, with method bodies removed
- files whose declarations hit an error, such as a type tsrs can't name
- constants that a decorator or parameter default reads
- files with JSDoc on the keys of an object in an initializer, such as a zod schema, and files whose initializers build on one, since declarations drop the JSDoc

The output can differ from a run without tsrs. Enum values and object keys can come out in another order, and an inferred return type can name an alias or expand it differently. Use tsrs everywhere you generate, so a project doesn't flip between the two. Without tsrs, or when tsrs fails, tsoa reads the sources. Set `TSOA_NATIVE=off` to turn it off.
