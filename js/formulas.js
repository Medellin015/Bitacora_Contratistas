'use strict';
/* ============================================================================
   3) formulas.js — mini-lenguaje de fórmulas del motor de formularios (window.Formulas)
   Sin eval ni new Function: tokenizador + parser de descenso recursivo + evaluador.
   Estructura:
     1. Tokenizador
     2. Parser (precedencia: o < y < == != < < <= > >= < + - < * / < unario < primario)
     3. Evaluador (funciones, si() perezosa, división por cero = 0)
     4. Evaluador de un formulario (referencias {x}, {fila.x}, {compuesta.campo}, memo, ciclos)
     5. Condiciones de visibilidad
     6. Validación estática de un formulario (sintaxis, referencias, ciclos)
   ============================================================================ */
(function (raiz) {
  const U = raiz.U;

  /* ===== 1. Tokenizador ===== */
  const OPERADORES = ['==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '(', ')', ','];
  const tokenizar = (texto) => {
    const t = String(texto || '');
    const tokens = [];
    let i = 0;
    while (i < t.length) {
      const c = t[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '{') {
        const fin = t.indexOf('}', i);
        if (fin < 0) throw new Error(`Falta cerrar la referencia en la posición ${i + 1}`);
        tokens.push({ tipo: 'ref', valor: t.slice(i + 1, fin).trim() });
        i = fin + 1; continue;
      }
      if (c === "'") {
        const fin = t.indexOf("'", i + 1);
        if (fin < 0) throw new Error(`Falta cerrar el texto en la posición ${i + 1}`);
        tokens.push({ tipo: 'str', valor: t.slice(i + 1, fin) });
        i = fin + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(t[i + 1] || ''))) {
        const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?|^[0-9]+\.?/i.exec(t.slice(i));
        tokens.push({ tipo: 'num', valor: Number(m[0]) });
        i += m[0].length; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(t.slice(i));
        tokens.push({ tipo: 'id', valor: m[0] });
        i += m[0].length; continue;
      }
      const op = OPERADORES.find((o) => t.startsWith(o, i));
      if (!op) throw new Error(`Carácter no válido «${c}» en la posición ${i + 1}`);
      tokens.push({ tipo: 'op', valor: op });
      i += op.length;
    }
    tokens.push({ tipo: 'fin' });
    return tokens;
  };

  /* ===== 2. Parser ===== */
  const parsear = (texto) => {
    const tokens = tokenizar(texto);
    let p = 0;
    const ver = () => tokens[p];
    const tomar = () => tokens[p++];
    const esOp = (v) => ver().tipo === 'op' && ver().valor === v;
    const esId = (v) => ver().tipo === 'id' && ver().valor === v;
    const esperarOp = (v) => { if (!esOp(v)) throw new Error(`Se esperaba «${v}»`); tomar(); };

    const expresion = () => o();
    const o = () => { let a = y(); while (esId('o')) { tomar(); a = { t: 'o', a, b: y() }; } return a; };
    const y = () => { let a = igualdad(); while (esId('y')) { tomar(); a = { t: 'y', a, b: igualdad() }; } return a; };
    const igualdad = () => { let a = comparacion(); while (esOp('==') || esOp('!=')) { const op = tomar().valor; a = { t: 'bin', op, a, b: comparacion() }; } return a; };
    const comparacion = () => { let a = suma(); while (esOp('<') || esOp('<=') || esOp('>') || esOp('>=')) { const op = tomar().valor; a = { t: 'bin', op, a, b: suma() }; } return a; };
    const suma = () => { let a = producto(); while (esOp('+') || esOp('-')) { const op = tomar().valor; a = { t: 'bin', op, a, b: producto() }; } return a; };
    const producto = () => { let a = unario(); while (esOp('*') || esOp('/')) { const op = tomar().valor; a = { t: 'bin', op, a, b: unario() }; } return a; };
    const unario = () => { if (esOp('-')) { tomar(); return { t: 'neg', a: unario() }; } return primario(); };
    const primario = () => {
      const tk = ver();
      if (tk.tipo === 'num') { tomar(); return { t: 'num', v: tk.valor }; }
      if (tk.tipo === 'str') { tomar(); return { t: 'str', v: tk.valor }; }
      if (tk.tipo === 'ref') { tomar(); return { t: 'ref', nombre: tk.valor }; }
      if (tk.tipo === 'id') {
        tomar();
        if (!esOp('(')) throw new Error(`«${tk.valor}» no es una función conocida (las referencias van entre llaves)`);
        tomar();
        const args = [];
        if (!esOp(')')) { args.push(expresion()); while (esOp(',')) { tomar(); args.push(expresion()); } }
        esperarOp(')');
        return { t: 'fn', nombre: tk.valor, args };
      }
      if (esOp('(')) { tomar(); const e = expresion(); esperarOp(')'); return e; }
      throw new Error(tk.tipo === 'fin' ? 'La fórmula termina antes de tiempo' : `Token inesperado «${tk.valor}»`);
    };
    const ast = expresion();
    if (ver().tipo !== 'fin') throw new Error(`Sobra «${ver().valor}» al final de la fórmula`);
    return ast;
  };

  const referencias = (ast, salida = new Set()) => {
    if (!ast) return salida;
    if (ast.t === 'ref') salida.add(ast.nombre);
    if (ast.a) referencias(ast.a, salida);
    if (ast.b) referencias(ast.b, salida);
    (ast.args || []).forEach((x) => referencias(x, salida));
    return salida;
  };
  const compilar = (texto) => {
    try { const ast = parsear(texto); return { ast, refs: Array.from(referencias(ast)), error: null }; }
    catch (e) { return { ast: null, refs: [], error: e.message }; }
  };

  /* ===== 3. Evaluador ===== */
  const aNumero = (v) => {
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null || v === undefined || v === '') return 0;
    if (Array.isArray(v)) return v.reduce((s, x) => s + aNumero(x), 0);
    const n = U.parseNumero(v);
    return n === null ? 0 : n;
  };
  const verdadero = (v) => (Array.isArray(v) ? v.length > 0 : !!v && v !== '0' && v !== 'NO');
  const esNumerico = (v) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v.replace(',', '.'))));
  const comparar = (op, a, b) => {
    if (op === '==' || op === '!=') {
      const iguales = esNumerico(a) && esNumerico(b) ? aNumero(a) === aNumero(b) : String(a == null ? '' : a) === String(b == null ? '' : b);
      return op === '==' ? iguales : !iguales;
    }
    const x = aNumero(a), y = aNumero(b);
    if (op === '<') return x < y;
    if (op === '<=') return x <= y;
    if (op === '>') return x > y;
    return x >= y;
  };
  const aplanarArgs = (args) => args.reduce((acc, x) => acc.concat(Array.isArray(x) ? x : [x]), []);
  const FUNCIONES = {
    max: (...args) => { const xs = aplanarArgs(args).map(aNumero); return xs.length ? Math.max(...xs) : 0; },
    min: (...args) => { const xs = aplanarArgs(args).map(aNumero); return xs.length ? Math.min(...xs) : 0; },
    redondear: (x, n) => U.redondear(aNumero(x), aNumero(n)),
    suma: (...args) => aplanarArgs(args).reduce((s, x) => s + aNumero(x), 0),
    abs: (x) => Math.abs(aNumero(x)),
    enLetras: (x) => U.numeroALetras(aNumero(x)),
  };
  // ctx: { ref(nombre), parametros, avisar(mensaje) }
  const evaluar = (ast, ctx) => {
    switch (ast.t) {
      case 'num': return ast.v;
      case 'str': return ast.v;
      case 'ref': return ctx.ref(ast.nombre);
      case 'neg': return -aNumero(evaluar(ast.a, ctx));
      case 'y': return verdadero(evaluar(ast.a, ctx)) && verdadero(evaluar(ast.b, ctx));
      case 'o': return verdadero(evaluar(ast.a, ctx)) || verdadero(evaluar(ast.b, ctx));
      case 'bin': {
        const a = evaluar(ast.a, ctx), b = evaluar(ast.b, ctx);
        switch (ast.op) {
          case '+': return aNumero(a) + aNumero(b);
          case '-': return aNumero(a) - aNumero(b);
          case '*': return aNumero(a) * aNumero(b);
          case '/': { const d = aNumero(b); if (d === 0) { ctx.avisar && ctx.avisar('División por cero (se toma 0)'); return 0; } return aNumero(a) / d; }
          default: return comparar(ast.op, a, b);
        }
      }
      case 'fn': {
        const nombre = ast.nombre;
        if (nombre === 'si') {
          // Perezosa: solo evalúa la rama elegida.
          if (ast.args.length < 2) throw new Error('si() necesita condición y al menos un valor');
          const c = verdadero(evaluar(ast.args[0], ctx));
          if (c) return evaluar(ast.args[1], ctx);
          return ast.args.length > 2 ? evaluar(ast.args[2], ctx) : 0;
        }
        const args = ast.args.map((x) => evaluar(x, ctx));
        const P = ctx.parametros || {};
        if (nombre === 'SMMLV') {
          const anio = String(Math.round(aNumero(args[0])) || '');
          const tabla = P.smmlv || {};
          if (tabla[anio] != null) return aNumero(tabla[anio]);
          // Sin valor para ese año: se usa el último año conocido y se avisa.
          const anios = Object.keys(tabla).map(Number).filter((x) => !isNaN(x)).sort((a, b) => a - b);
          const menor = anios.filter((x) => x <= Number(anio)).pop();
          ctx.avisar && ctx.avisar(`No hay SMMLV configurado para ${anio || '(año vacío)'}`);
          return menor != null ? aNumero(tabla[menor]) : 0;
        }
        if (nombre === 'tasaARL') {
          const clase = String(args[0] || '').toUpperCase().trim();
          const v = P[`pctARL_${clase}`];
          if (v == null) ctx.avisar && ctx.avisar(`No hay tasa ARL para la clase «${clase || '(vacía)'}»`);
          return aNumero(v);
        }
        if (nombre === 'param') {
          const v = U.obtenerRuta(P, String(args[0] || ''));
          if (v === undefined) ctx.avisar && ctx.avisar(`No existe el parámetro «${args[0]}»`);
          return v == null ? 0 : v;
        }
        const f = FUNCIONES[nombre];
        if (!f) throw new Error(`Función desconocida «${nombre}»`);
        return f(...args);
      }
      default: throw new Error('Nodo desconocido');
    }
  };

  /* ===== 4. Evaluador de un formulario ===== */
  const cacheCompilado = new Map();
  const compilado = (texto) => {
    if (!cacheCompilado.has(texto)) cacheCompilado.set(texto, compilar(texto));
    return cacheCompilado.get(texto);
  };
  const indexar = (formulario) => {
    const preguntas = {};
    const capituloDe = {};
    ((formulario && formulario.capitulos) || []).forEach((cap) => {
      (cap.preguntas || []).forEach((q) => { preguntas[q.id] = q; capituloDe[q.id] = cap.id; });
    });
    return { preguntas, capituloDe };
  };

  /**
   * Crea un evaluador con memoria para un formulario y sus respuestas.
   * respuestas: { preguntaId: valor } y COMPUESTA → [ { subId: valor } ].
   */
  const crearEvaluador = ({ formulario, respuestas, parametros }) => {
    const { preguntas } = indexar(formulario);
    const memo = new Map();
    const enCurso = new Set();
    const errores = [];
    const avisos = [];
    const R = respuestas || {};
    const P = parametros || {};
    const avisar = (contexto) => (m) => { if (!avisos.some((x) => x.mensaje === m && x.contexto === contexto)) avisos.push({ contexto, mensaje: m }); };
    const errorEn = (contexto, m) => { errores.push({ contexto, mensaje: m }); };

    const evaluarFormula = (texto, clave, ref, contexto) => {
      if (memo.has(clave)) return memo.get(clave);
      if (enCurso.has(clave)) { errorEn(contexto, 'Referencia circular'); return 0; }
      enCurso.add(clave);
      let v = 0;
      const c = compilado(texto);
      if (c.error) errorEn(contexto, c.error);
      else { try { v = evaluar(c.ast, { ref, parametros: P, avisar: avisar(contexto) }); } catch (e) { errorEn(contexto, e.message); v = 0; } }
      enCurso.delete(clave);
      memo.set(clave, v);
      return v;
    };

    // Valor de una pregunta de primer nivel (calculada o respondida).
    const valor = (id) => {
      const q = preguntas[id];
      if (!q) { return undefined; }
      if (q.tipo === 'CALCULADA') return evaluarFormula(q.formula || '', `top:${id}`, (n) => resolver(n, null), q.id);
      return R[id];
    };
    const filasDe = (compId) => (Array.isArray(R[compId]) ? R[compId] : []);
    const valorFila = (compId, indice, subId) => {
      const comp = preguntas[compId];
      const sub = comp && (comp.subpreguntas || []).find((s) => s.id === subId);
      const fila = filasDe(compId)[indice] || {};
      if (!sub) return undefined;
      if (sub.tipo === 'CALCULADA') return evaluarFormula(sub.formula || '', `fila:${compId}:${indice}:${subId}`, (n) => resolver(n, { compId, indice }), `${compId}.${subId}`);
      return fila[subId];
    };
    const lista = (compId, subId) => filasDe(compId).map((_, i) => valorFila(compId, i, subId));

    // Resuelve una referencia según el ámbito (fila actual o nivel superior).
    const resolver = (nombre, ambito) => {
      if (nombre === 'valor') return undefined; // solo tiene sentido en alertaSi
      if (nombre.startsWith('fila.')) {
        if (!ambito) { errorEn(nombre, '{fila.…} solo se usa dentro de una pregunta compuesta'); return undefined; }
        return valorFila(ambito.compId, ambito.indice, nombre.slice(5));
      }
      if (nombre.includes('.')) {
        const [compId, subId] = nombre.split('.');
        if (preguntas[compId] && preguntas[compId].tipo === 'COMPUESTA') return lista(compId, subId);
        errorEn(nombre, `No existe la compuesta «${compId}»`);
        return [];
      }
      if (!preguntas[nombre]) { errorEn(nombre, `No existe la pregunta «${nombre}»`); return undefined; }
      return valor(nombre);
    };

    const evaluarAlerta = (texto, propio, ambito, contexto) => {
      if (!texto) return false;
      const c = compilado(texto);
      if (c.error) { errorEn(contexto, c.error); return false; }
      try {
        return verdadero(evaluar(c.ast, { ref: (n) => (n === 'valor' ? propio : resolver(n, ambito)), parametros: P, avisar: avisar(contexto) }));
      } catch (e) { errorEn(contexto, e.message); return false; }
    };
    const alerta = (id) => { const q = preguntas[id]; return q && q.alertaSi ? evaluarAlerta(q.alertaSi, valor(id), null, id) : false; };
    const alertaFila = (compId, indice, subId) => {
      const comp = preguntas[compId];
      const sub = comp && (comp.subpreguntas || []).find((s) => s.id === subId);
      return sub && sub.alertaSi ? evaluarAlerta(sub.alertaSi, valorFila(compId, indice, subId), { compId, indice }, `${compId}.${subId}`) : false;
    };

    return { valor, valorFila, lista, alerta, alertaFila, errores, avisos };
  };

  /* ===== 5. Condiciones ===== */
  // condicion: { pregunta, operador, valor } | { y: [c…] } | { o: [c…] }
  // obtener(nombre): valor de 'x' o 'fila.x' según el ámbito.
  const evaluarCondicion = (condicion, obtener) => {
    if (!condicion) return true;
    if (Array.isArray(condicion.y)) return condicion.y.every((c) => evaluarCondicion(c, obtener));
    if (Array.isArray(condicion.o)) return condicion.o.some((c) => evaluarCondicion(c, obtener));
    const v = obtener(condicion.pregunta);
    const esperado = condicion.valor;
    const vacio = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    switch (condicion.operador) {
      case 'lleno': return !vacio;
      case 'vacio': return vacio;
      case 'igual': return Array.isArray(v) ? v.map(String).includes(String(esperado)) : comparar('==', v, esperado);
      case 'distinto': return Array.isArray(v) ? !v.map(String).includes(String(esperado)) : !comparar('==', v, esperado);
      case 'en': return (Array.isArray(esperado) ? esperado : [esperado]).map(String).includes(String(v));
      case 'mayor': return !vacio && comparar('>', v, esperado);
      case 'menor': return !vacio && comparar('<', v, esperado);
      default: return true;
    }
  };

  /* ===== 6. Validación estática ===== */
  const validarFormulario = (formulario) => {
    const problemas = [];
    const { preguntas } = indexar(formulario);
    const nodos = {}; // clave → [dependencias]
    const existeRef = (nombre, comp) => {
      if (nombre === 'valor') return true;
      if (nombre.startsWith('fila.')) return !!(comp && (comp.subpreguntas || []).some((s) => s.id === nombre.slice(5)));
      if (nombre.includes('.')) { const [c, s] = nombre.split('.'); const q = preguntas[c]; return !!(q && q.tipo === 'COMPUESTA' && (q.subpreguntas || []).some((x) => x.id === s)); }
      return !!preguntas[nombre];
    };
    const claveDe = (nombre, comp) => {
      if (nombre.startsWith('fila.')) return `${comp.id}.${nombre.slice(5)}`;
      return nombre;
    };
    const revisar = (q, comp, contexto) => {
      ['formula', 'alertaSi'].forEach((campo) => {
        if (!q[campo]) return;
        const c = compilar(q[campo]);
        if (c.error) { problemas.push(`${contexto}: ${campo} → ${c.error}`); return; }
        c.refs.forEach((r) => {
          if (!existeRef(r, comp)) problemas.push(`${contexto}: ${campo} referencia «${r}» que no existe`);
          else if (r === 'valor' && campo !== 'alertaSi') problemas.push(`${contexto}: {valor} solo se usa en alertaSi`);
        });
        if (campo === 'formula') nodos[contexto] = c.refs.filter((r) => r !== 'valor').map((r) => claveDe(r, comp));
      });
      if (q.tipo === 'CALCULADA' && !q.formula) problemas.push(`${contexto}: la pregunta calculada no tiene fórmula`);
    };
    Object.values(preguntas).forEach((q) => {
      revisar(q, null, q.id);
      if (q.tipo === 'COMPUESTA') (q.subpreguntas || []).forEach((s) => revisar(s, q, `${q.id}.${s.id}`));
    });
    // Las precargas (precargarDe) también son dependencias: en un ciclo el valor no converge.
    Object.values(preguntas).forEach((q) => {
      if (q.tipo !== 'COMPUESTA') return;
      (q.subpreguntas || []).forEach((s) => { if (s.precargarDe && s.tipo !== 'CALCULADA') { const k = `${q.id}.${s.id}`; nodos[k] = (nodos[k] || []).concat([String(s.precargarDe)]); } });
    });
    // Ciclos (DFS sobre el grafo de dependencias de las calculadas y las precargas).
    const estado = {};
    const visitar = (n, pila) => {
      if (estado[n] === 2) return;
      if (estado[n] === 1) { problemas.push(`Referencia circular: ${[...pila, n].join(' → ')}`); return; }
      estado[n] = 1;
      (nodos[n] || []).forEach((d) => visitar(d, [...pila, n]));
      estado[n] = 2;
    };
    Object.keys(nodos).forEach((n) => visitar(n, []));
    return problemas;
  };

  raiz.Formulas = { tokenizar, parsear, compilar, evaluar, aNumero, verdadero, crearEvaluador, evaluarCondicion, validarFormulario, indexar };
})(window);
