// CartList.jsx — list of cart items + qty stepper + remove; empty state.
function fmt(n) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n); }

function CartItem({ item, onQty, onRemove }) {
  return (
    <div className="cart-item">
      <div>
        <div className="cart-item-name">{item.nome}</div>
        <div className="cart-item-meta">
          <span className="zh">{item.han}</span>
          <span>·</span>
          <span className="cart-item-unit">{item.qty} × {fmt(item.unit)}</span>
        </div>
      </div>
      <div className="qty-stepper" role="group" aria-label="Quantidade">
        <button onClick={() => onQty(Math.max(1, item.qty - 1))} aria-label="Diminuir">−</button>
        <span className="qty-val">{item.qty}</span>
        <button onClick={() => onQty(item.qty + 1)} aria-label="Aumentar">+</button>
      </div>
      <div style={{display:'flex', alignItems:'center'}}>
        <div className="cart-item-total">{fmt(item.qty * item.unit)}</div>
        <button className="cart-item-remove" onClick={onRemove} aria-label="Remover">✕</button>
      </div>
    </div>
  );
}

function CartList({ items, onQty, onRemove }) {
  if (!items.length) {
    return (
      <div className="caixa-cart-empty">
        <div className="caixa-cart-empty-emoji" aria-hidden>🛒</div>
        <div className="caixa-cart-empty-title">Carrinho vazio</div>
        <div className="caixa-cart-empty-sub">Adicione produtos usando o campo de busca acima, ou aponte o leitor de código de barras para o item.</div>
      </div>
    );
  }
  return (
    <div>
      {items.map((it) => (
        <CartItem key={it.id} item={it}
          onQty={(q) => onQty(it.id, q)}
          onRemove={() => onRemove(it.id)} />
      ))}
    </div>
  );
}

window.CartList = CartList;
window.fmtBRL = fmt;
