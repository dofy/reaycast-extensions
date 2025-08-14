import { Action, ActionPanel, Form, showToast, Toast } from "@raycast/api";
import { useState } from "react";

function JWTEditor() {
  const [jwtToken, setJwtToken] = useState("");
  const [publicKey, setPublicKey] = useState("");

  const handleSubmit = async (values: { jwt: string; publicKey: string }) => {
    try {
      // 这里处理 JWT 编码/解码逻辑
      console.log("JWT:", values.jwt);
      console.log("Public Key:", values.publicKey);

      await showToast({
        style: Toast.Style.Success,
        title: "JWT 处理成功",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "处理失败",
        message: String(error),
      });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Process Jwt" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="jwt"
        title="JWT Token"
        placeholder="输入您的 JWT token..."
        value={jwtToken}
        onChange={setJwtToken}
      />
      <Form.TextArea
        id="publicKey"
        title="Public Key"
        placeholder="输入您的 public key..."
        value={publicKey}
        onChange={setPublicKey}
      />
    </Form>
  );
}

export default function Command() {
  return <JWTEditor />;
}
