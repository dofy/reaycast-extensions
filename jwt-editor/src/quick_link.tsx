import { Action, ActionPanel, Detail, Form, useNavigation } from "@raycast/api";
import { createDeeplink } from "@raycast/utils";

function QuickLinkPreview({ name, jwt }: { name: string; jwt: string }) {
  const link = createDeeplink({
    command: "editor",
    extensionName: "jwt-editor",
    ownerOrAuthorName: "phpz-xyz",
    context: { jwt },
  });

  return (
    <Detail
      navigationTitle="Create Quick Link"
      markdown={`## Quick Link: ${name}\n\nPress **⏎ Return** to save this quick link to Raycast.\n\nOpening it will launch the JWT Editor with your token pre-filled and ready to decode.`}
      actions={
        <ActionPanel>
          <Action.CreateQuicklink quicklink={{ name, link }} />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const { push } = useNavigation();

  return (
    <Form
      navigationTitle="Create JWT Quick Link"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Continue"
            onSubmit={({ name, jwt }: { name: string; jwt: string }) => {
              push(<QuickLinkPreview name={name} jwt={jwt} />);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" placeholder="My Dev Token" />
      <Form.TextArea id="jwt" title="JWT Token" placeholder="Paste the JWT token to pre-fill when opened..." />
      <Form.Description text="Creates a Raycast quick link that opens the JWT Editor with this token pre-filled." />
    </Form>
  );
}
