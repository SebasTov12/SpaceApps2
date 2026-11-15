/**
 * Convivencia entre React y la traducción automática del navegador (Google Translate).
 *
 * El traductor pone delante de cada texto un <font> con la traducción y quita el nodo de texto
 * original. React sigue apuntando a ese nodo original, así que:
 *  - al quitarlo o insertar junto a él, el navegador lanza NotFoundError y la vista entera cae
 *    al límite de error ("No pudimos cargar esta vista");
 *  - al cambiar su texto (contadores, Saru escribiendo, paneles), el cambio no se ve: queda la
 *    traducción vieja.
 * Aquí se recuerda qué <font> sustituyó a cada texto para que React siga operando sobre él y,
 * cuando un texto cambia, se devuelve el original a su sitio para que el traductor lo traduzca de nuevo.
 */
type GuardWindow = Window & { __sarosDomGuard?: boolean };
type Tracked = Text & { __sarosFont?: Element };

const isFont = (node: Node | null): node is Element => !!node && node.nodeType === 1 && (node as Element).tagName === "FONT";

/** El <font> que hoy ocupa el lugar de ese texto en la página (si lo hay). */
function stand(node: Node): Element | null {
  const font = (node as Tracked).__sarosFont;
  return font && font.isConnected ? font : null;
}

export function installTranslateGuard() {
  if (typeof window === "undefined" || typeof Node !== "function") return;
  const w = window as GuardWindow;
  if (w.__sarosDomGuard) return;
  w.__sarosDomGuard = true;

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode === this) {
      // el traductor quita el texto original justo después de poner su <font> delante: se recuerda
      if (child.nodeType === 3 && isFont(child.previousSibling)) (child as unknown as Tracked).__sarosFont = child.previousSibling;
      return removeChild.call(this, child) as T;
    }
    // React quita un texto que el traductor ya sustituyó: se quita su traducción
    const font = stand(child);
    if (font?.parentNode) removeChild.call(font.parentNode, font);
    else if (child.parentNode) removeChild.call(child.parentNode, child);
    return child;
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function guardedInsertBefore<T extends Node>(this: Node, node: T, reference: Node | null): T {
    if (reference && reference.parentNode !== this) {
      const target = stand(reference) ?? reference;
      const holder = target.parentNode;
      if (holder && (holder === this || this.contains(holder))) return insertBefore.call(holder, node, target) as T;
      return insertBefore.call(this, node, null) as T;
    }
    return insertBefore.call(this, node, reference) as T;
  };

  // Cuando React cambia un texto ya traducido, el original vuelve a su sitio con el texto nuevo
  // y el traductor (que vigila la página) lo traduce otra vez.
  const restore = (node: Node) => {
    if (node.nodeType !== 3 || node.isConnected) return;
    const font = stand(node);
    if (!font?.parentNode) return;
    font.parentNode.replaceChild(node, font);
    (node as Tracked).__sarosFont = undefined;
  };
  const wrapSetter = (proto: object, key: "nodeValue" | "data" | "textContent") => {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (!desc?.set || !desc.get) return;
    const { get, set } = desc;
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: desc.enumerable,
      get,
      set(this: Node, value: string | null) {
        set.call(this, value);
        restore(this);
      },
    });
  };
  wrapSetter(Node.prototype, "nodeValue");
  wrapSetter(CharacterData.prototype, "data");
}

installTranslateGuard();
