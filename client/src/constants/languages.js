/**
 * Language table for the selector.
 *
 * `id` is what travels over the socket and to /api/execute; `monaco` is the
 * language id Monaco uses for highlighting. They differ for C++ only.
 * `starter` seeds a brand-new room so it is never a blank page.
 */
export const LANGUAGES = [
  {
    id: 'javascript',
    label: 'JavaScript',
    monaco: 'javascript',
    starter: `// JavaScript — Node.js\nconsole.log("Hello from CodeSync!");\n`,
  },
  {
    id: 'python',
    label: 'Python',
    monaco: 'python',
    starter: `# Python 3\nprint("Hello from CodeSync!")\n`,
  },
  {
    id: 'cpp',
    label: 'C++',
    monaco: 'cpp',
    starter: `#include <iostream>\n\nint main() {\n    std::cout << "Hello from CodeSync!" << std::endl;\n    return 0;\n}\n`,
  },
  {
    id: 'java',
    // The runner compiles this as Main.java, so the public class must be Main.
    label: 'Java',
    monaco: 'java',
    starter: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from CodeSync!");\n    }\n}\n`,
  },
];

export const DEFAULT_LANGUAGE = 'javascript';

export function getLanguage(id) {
  return LANGUAGES.find((lang) => lang.id === id) ?? LANGUAGES[0];
}
