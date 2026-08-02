import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "./assets/vite.svg";
import heroImg from "./assets/hero.png";
import "./App.css";
import { ConnectWallet } from "./components/ConnectWallet";
import { CreateMovementForm } from "./components/CreateMovementForm";

function App() {
  return (
    <>
    <ConnectWallet />
    <CreateMovementForm />
    </>
  );
}

export default App;
