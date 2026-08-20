/**
 * The four languages the editor supports.
 *
 * `piston` is the runtime name understood by the Piston API and `filename`
 * matters for compiled languages — Java in particular requires the file to be
 * named after its public class, hence `Main.java`.
 */
export const LANGUAGES = {
  javascript: { piston: 'javascript', filename: 'main.js' },
  python: { piston: 'python', filename: 'main.py' },
  cpp: { piston: 'c++', filename: 'main.cpp' },
  java: { piston: 'java', filename: 'Main.java' },
};

export const DEFAULT_LANGUAGE = 'javascript';

export function isSupportedLanguage(language) {
  return Object.prototype.hasOwnProperty.call(LANGUAGES, language);
}
