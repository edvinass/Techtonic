import { AuthScreen } from "./ui/AuthScreen";
import { GameScreen } from "./ui/GameScreen";
import { MenuScreen } from "./ui/MenuScreen";
import { useGameStore } from "./store/gameStore";

export default function App() {
  const screen = useGameStore((s) => s.screen);

  if (screen === "auth") return <AuthScreen />;
  if (screen === "menu") return <MenuScreen />;
  return <GameScreen />;
}
