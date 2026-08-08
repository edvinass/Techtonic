import { AuthScreen } from "./ui/AuthScreen";
import { GameScreen } from "./ui/GameScreen";
import { LibraryModal } from "./ui/LibraryModal";
import { MenuScreen } from "./ui/MenuScreen";
import { useGameStore } from "./store/gameStore";

export default function App() {
  const screen = useGameStore((s) => s.screen);

  return (
    <>
      {screen === "auth" ? <AuthScreen /> : null}
      {screen === "menu" ? <MenuScreen /> : null}
      {screen === "game" ? <GameScreen /> : null}
      {screen !== "auth" ? <LibraryModal /> : null}
    </>
  );
}
