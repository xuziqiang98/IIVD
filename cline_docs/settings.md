## For All Settings

1. Add the setting to ExtensionMessage.ts:

    - Add the setting to the ExtensionState interface
    - Make it required if it has a default value, optional if it can be undefined
    - Example: `preferredLanguage: string`

2. Add test coverage:
    - Add the setting to mockState in ClineProvider.test.ts
    - Add test cases for setting persistence and state updates
    - Ensure all tests pass before submitting changes

## For Checkbox Settings

1. Add the message type to WebviewMessage.ts:

    - Add the setting name to the WebviewMessage type's type union
    - Example: `| "multisearchDiffEnabled"`

2. Add the setting to ExtensionStateContext.tsx:

    - Add the setting to the ExtensionStateContextType interface
    - Add the setter function to the interface
    - Add the setting to the initial state in useState
    - Add the setting to the contextValue object
    - Example:
        ```typescript
        interface ExtensionStateContextType {
        	multisearchDiffEnabled: boolean
        	setMultisearchDiffEnabled: (value: boolean) => void
        }
        ```

3. Add the setting to ClineProvider.ts:

    - Add the setting name to the GlobalStateKey type union
    - Add the setting to the Promise.all array in getState
    - Add the setting to the return value in getState with a default value
    - Add the setting to the destructured variables in getStateToPostToWebview
    - Add the setting to the return value in getStateToPostToWebview
    - Add a case in setWebviewMessageListener to handle the setting's message type
    - Example:
        ```typescript
        case "multisearchDiffEnabled":
          await this.updateGlobalState("multisearchDiffEnabled", message.bool)
          await this.postStateToWebview()
          break
        ```

4. Add the checkbox UI to SettingsView.tsx:

    - Import the setting and its setter from ExtensionStateContext
    - Add the VSCodeCheckbox component with the setting's state and onChange handler
    - Add appropriate labels and description text
    - Example:
        ```typescript
        <VSCodeCheckbox
          checked={multisearchDiffEnabled}
          onChange={(e: any) => setMultisearchDiffEnabled(e.target.checked)}
        >
          <span style={{ fontWeight: "500" }}>Enable multi-search diff matching</span>
        </VSCodeCheckbox>
        ```

5. Add the setting to handleSubmit in SettingsView.tsx:
    - Add a vscode.postMessage call to send the setting's value when clicking Done
    - Example:
        ```typescript
        vscode.postMessage({ type: "multisearchDiffEnabled", bool: multisearchDiffEnabled })
        ```

## For Select/Dropdown Settings

1. Add the message type to WebviewMessage.ts:

    - Add the setting name to the WebviewMessage type's type union
    - Example: `| "preferredLanguage"`

2. Add the setting to ExtensionStateContext.tsx:

    - Add the setting to the ExtensionStateContextType interface
    - Add the setter function to the interface
    - Add the setting to the initial state in useState with a default value
    - Add the setting to the contextValue object
    - Example:
        ```typescript
        interface ExtensionStateContextType {
        	preferredLanguage: string
        	setPreferredLanguage: (value: string) => void
        }
        ```

3. Add the setting to ClineProvider.ts:

    - Add the setting name to the GlobalStateKey type union
    - Add the setting to the Promise.all array in getState
    - Add the setting to the return value in getState with a default value
    - Add the setting to the destructured variables in getStateToPostToWebview
    - Add the setting to the return value in getStateToPostToWebview
    - Add a case in setWebviewMessageListener to handle the setting's message type
    - Example:
        ```typescript
        case "preferredLanguage":
          await this.updateGlobalState("preferredLanguage", message.text)
          await this.postStateToWebview()
          break
        ```

4. Add the select UI to SettingsView.tsx:

    - Import the setting and its setter from ExtensionStateContext
    - Add the select element with appropriate styling to match VSCode's theme
    - Add options for the dropdown
    - Add appropriate labels and description text
    - Example:
        ```typescript
        <select
          value={preferredLanguage}
          onChange={(e) => setPreferredLanguage(e.target.value)}
          style={{
            width: "100%",
            padding: "4px 8px",
            backgroundColor: "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            border: "1px solid var(--vscode-input-border)",
            borderRadius: "2px"
          }}>
          <option value="English">English</option>
          <option value="Spanish">Spanish</option>
          ...
        </select>
        ```

5. Add the setting to handleSubmit in SettingsView.tsx:
    - Add a vscode.postMessage call to send the setting's value when clicking Done
    - Example:
        ```typescript
        vscode.postMessage({ type: "preferredLanguage", text: preferredLanguage })
        ```

These steps ensure that:

- The setting's state is properly typed throughout the application
- The setting persists between sessions
- The setting's value is properly synchronized between the webview and extension
- The setting has a proper UI representation in the settings view
- Test coverage is maintained for the new setting
