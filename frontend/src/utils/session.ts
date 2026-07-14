export const getSessionId = (): string => {
  if (typeof window === "undefined") return "";
  let sessionId = localStorage.getItem("nib_assistant_session_id");
  if (!sessionId) {
    sessionId = "SESS_" + crypto.randomUUID();
    localStorage.setItem("nib_assistant_session_id", sessionId);
  }
  return sessionId;
};
