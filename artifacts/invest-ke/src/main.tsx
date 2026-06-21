import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

const externalApi = import.meta.env.VITE_API_URL as string | undefined;
if (externalApi) {
  setBaseUrl(externalApi.replace(/\/+$/, ""));
}

setAuthTokenGetter(() => localStorage.getItem("investke_token"));

createRoot(document.getElementById("root")!).render(<App />);
