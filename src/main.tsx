import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/index.css";

const saved = localStorage.getItem("lw_theme");
if (saved === "dark") {
  document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = "dark";
} else {
  document.documentElement.style.colorScheme = "light";
}

createRoot(document.getElementById("root")!).render(<App />);
