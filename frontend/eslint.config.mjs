import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@base-ui/react", "@base-ui/react/*"],
          message: "Use the existing radix-ui primitives; the app's selectors use Radix Select.",
        }],
      }],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "components/layout/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["radix-ui", "@radix-ui/*", "@base-ui/react", "@base-ui/react/*"], message: "Use the shadcn components in @/components/ui; primitives belong in that directory." },
          { group: ["**/components/ui/Card", "**/components/ui/combobox", "**/components/ui/KpiCard", "**/components/ui/StatisticsTable"], caseSensitive: true, message: "Use the canonical lowercase UI paths; analytics compositions belong in features/analytics/components." },
        ],
      }],
      "no-restricted-syntax": ["error",
        {
          selector: "JSXOpeningElement[name.name=/^(button|select|textarea|table|thead|tbody|tfoot|tr|th|td|caption|label|details|summary)$/]",
          message: "Use the installed shadcn component from @/components/ui instead of recreating a control.",
        },
        {
          selector: "JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type'][value.value='file']))",
          message: "Use Input, Checkbox, RadioGroup or Slider. Native file/directory inputs are the documented exception.",
        },
        {
          selector: "JSXOpeningElement[name.name=/^(div|span)$/]:has(JSXAttribute[name.name='role'][value.value='button'])",
          message: "Use Button for keyboard-accessible actions.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
