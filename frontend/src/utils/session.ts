export const getSessionId = (): string => {
  if (typeof window === "undefined") return "";
  let sessionId = localStorage.getItem("nib_assistant_session_id");
  if (!sessionId) {
    sessionId = "SESS_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem("nib_assistant_session_id", sessionId);
  }
  return sessionId;
};
