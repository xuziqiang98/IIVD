# IIVD

**IIVD** is **I**mplementation **I**nconsistency **V**ulnerability **D**etector, which forked from **Roo Code**. It can:

- Analyse and extract field constraints and FSM transitions from rfcs.
- Detect inconsistency bugs in concreate implementation.

## Local Setup & Development

1. **Clone** the repo:
    ```bash
    git clone https://github.com/xuziqiang98/IIVD.git
    ```
2. **Install dependencies**:
    ```bash
    npm run install:all
    ```
3. **Build** the extension:
    ```bash
    npm run build
    ```
    - A `.vsix` file will appear in the `bin/` directory.
4. **Install** the `.vsix` manually if desired:
    ```bash
    code --install-extension bin/iivd-0.0.1.vsix
    ```
5. **Start the webview (Vite/React app with HMR)**:
    ```bash
    npm run dev
    ```

Changes to the webview will appear immediately. Changes to the core extension will require a restart of the extension host.

## License

[Apache 2.0 © 2025](./LICENSE)
