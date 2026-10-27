import "./styles.css";
import { Overworld } from "./Overworld";

const element = document.querySelector<HTMLElement>(".game-container");
if (!element) throw new Error("Elemento .game-container não encontrado");

const overworld = new Overworld({ element });
overworld.init();
