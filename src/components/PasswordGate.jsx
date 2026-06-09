import { Navigate } from "react-router-dom";

export default function PasswordGate({ children }) {
  const allowed = sessionStorage.getItem("chromies_access") === "true";
  return allowed ? children : <Navigate to="/" replace />;
}
