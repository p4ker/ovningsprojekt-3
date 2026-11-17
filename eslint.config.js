// Grundkonfiguration plus projektets egna regler ur docs/standard.md.
// Varje egen regel har ett meddelande som säger hur felet rättas.
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

const SQL_MEDDELANDE =
  "SQL får inte byggas med strängmallar eller sammanslagning. " +
  "Använd db.query(sql, [värden]) med $1, $2 (docs/standard.md: Databas).";

const TEST_MEDDELANDE =
  "Tester får inte hoppas över eller köras ensamma. " +
  "Rätta koden eller testet (docs/standard.md: Tester).";

const avstangdaTester = ["it", "test", "describe"].flatMap((object) =>
  ["skip", "only"].map((property) => ({ object, property, message: TEST_MEDDELANDE })),
);

module.exports = tseslint.config(
  { ignores: ["dist/", "node_modules/", ".venv/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Databas: all SQL är parametriserad.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='query'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]",
          message: SQL_MEDDELANDE,
        },
        {
          selector:
            "CallExpression[callee.property.name='query'][arguments.0.type='BinaryExpression'][arguments.0.operator='+']",
          message: SQL_MEDDELANDE,
        },
      ],
      // Tester: ett test tas aldrig bort eller hoppas över för att bli grönt.
      "no-restricted-properties": ["error", ...avstangdaTester],
    },
  },
);
