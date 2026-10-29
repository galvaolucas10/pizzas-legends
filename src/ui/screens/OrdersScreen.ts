import { Menu, type UiInput } from "../components/Menu";
import { h } from "../dom";

/** Um pedido online (entrega) para mostrar na tela. */
export interface OrderLine {
  pizza: string;
  address: string;
  /** "esperando" (na fila), "preparando" (o garçom está fazendo) ou "a caminho" (com o motoboy). */
  status: "esperando" | "preparando" | "a caminho" | "entregue";
  /** Moedas recebidas (pedido entregue). */
  coins?: number;
}

export interface OrdersScreenOptions {
  doc: Document;
  root: HTMLElement;
  input: UiInput;
  /** Pedidos online agora (lido de novo a cada atualização). */
  orders(): OrderLine[];
}

const STATUS_TEXT: Record<OrderLine["status"], string> = {
  esperando: "na fila",
  preparando: "👨‍🍳 o Beto está fazendo",
  "a caminho": "🛵 a caminho com o motoboy",
  entregue: "✔ entregue",
};

/** Pedidos online (entregas): o que está na fila, sendo feito e a caminho. Botão "📱 Pedidos". */
export class OrdersScreen {
  done = false;
  private readonly root: HTMLElement;
  private readonly menu: Menu;
  private readonly list: HTMLElement;
  private lastPaint = "";

  constructor(private readonly o: OrdersScreenOptions) {
    const doc = o.doc;
    this.root = h(doc, "div", "overlay");
    const box = h(doc, "div", "panel pause");
    this.list = h(doc, "div", "oven__side");
    this.menu = new Menu(doc, "oven__menu");
    this.menu.onCancel = () => (this.done = true);
    this.menu.setItems([{ label: "Fechar", onSelect: () => (this.done = true) }]);
    box.append(
      h(doc, "h2", "panel__title", "📱 Pedidos online (entregas)"),
      this.list,
      this.menu.element,
      h(
        doc,
        "p",
        "panel__hint",
        "O Beto prepara e o motoboy entrega. O dinheiro cai no seu saldo.",
      ),
    );
    this.root.append(box);
    o.root.append(this.root);
    this.paint();
  }

  private paint(): void {
    const orders = this.o.orders();
    const key = JSON.stringify(orders);
    if (key === this.lastPaint) return;
    this.lastPaint = key;
    const doc = this.o.doc;
    if (orders.length === 0) {
      this.list.replaceChildren(
        h(doc, "p", "panel__text", "Nenhum pedido online ainda. O primeiro chega em instantes!"),
      );
      return;
    }
    const ul = h(doc, "ul", "panel__list");
    for (const order of orders) {
      const li = h(doc, "li", "row");
      li.append(
        h(doc, "span", "", `🍕 ${order.pizza} · ${order.address}`),
        h(
          doc,
          "span",
          "row__detail",
          STATUS_TEXT[order.status] + (order.coins ? ` · +${order.coins} moedas` : ""),
        ),
      );
      ul.append(li);
    }
    this.list.replaceChildren(ul);
  }

  update(): void {
    if (this.done) return;
    this.paint(); // a lista muda enquanto a tela está aberta (a moto sai e volta)
    this.menu.handle(this.o.input);
  }

  destroy(): void {
    this.root.remove();
  }
}
