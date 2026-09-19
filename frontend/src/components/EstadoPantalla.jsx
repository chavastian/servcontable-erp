/**
 * Los tres estados que toda pantalla con datos necesita: cargando, vacía y con
 * error.
 *
 * De las 39 pantallas, solo diez mostraban algo mientras esperaban. El resto
 * dejaba la tabla en blanco, que es indistinguible de «no hay datos» y de «se
 * cayó la conexión». Frente a un balance en blanco, quien trabaja no sabe si
 * confiar en lo que ve.
 *
 * Los tres se dibujan con los mismos tokens visuales del sistema, sin rediseño.
 */

/**
 * Mientras se esperan los datos. `tabla` lo hace ocupar el ancho de la tabla.
 */
function EstadoCargando({ mensaje = "Cargando...", filas = 3 }) {
  return (
    <div className="sc-estado sc-estado--cargando" role="status" aria-live="polite">
      <div className="sc-estado__barras" aria-hidden="true">
        {Array.from({ length: filas }).map((_, indice) => (
          <span key={indice} className="sc-estado__barra" />
        ))}
      </div>
      <p className="sc-estado__texto">{mensaje}</p>
    </div>
  );
}

/**
 * Cuando la consulta salió bien y no hay nada que mostrar.
 *
 * Dice qué hacer, no solo que está vacío: un mensaje que no propone nada deja
 * a la persona detenida.
 */
function EstadoVacio({
  titulo = "Sin datos para mostrar",
  mensaje = "",
  accion = null,
  etiquetaAccion = "",
}) {
  return (
    <div className="sc-estado sc-estado--vacio">
      <p className="sc-estado__titulo">{titulo}</p>
      {mensaje ? <p className="sc-estado__texto">{mensaje}</p> : null}
      {accion && etiquetaAccion ? (
        <button type="button" className="sc-btn sc-btn--primary" onClick={accion}>
          {etiquetaAccion}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Cuando la consulta falló.
 *
 * Ofrece reintentar en el mismo lugar: obligar a recargar la página completa
 * pierde los filtros que la persona ya eligió.
 */
function EstadoError({
  titulo = "No se pudieron cargar los datos",
  mensaje = "",
  alReintentar = null,
}) {
  return (
    <div className="sc-estado sc-estado--error" role="alert">
      <p className="sc-estado__titulo">{titulo}</p>
      {mensaje ? <p className="sc-estado__texto">{mensaje}</p> : null}
      {alReintentar ? (
        <button type="button" className="sc-btn sc-btn--primary" onClick={alReintentar}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

/**
 * Los tres en uno, para el caso habitual.
 *
 * Decide en el orden en que importa: primero si hay un error, después si sigue
 * cargando, después si está vacío. Si no ocurre nada de eso, dibuja el
 * contenido.
 */
function EstadoPantalla({
  cargando = false,
  error = "",
  vacio = false,
  alReintentar = null,
  mensajeCargando,
  tituloVacio,
  mensajeVacio,
  accionVacio,
  etiquetaAccionVacio,
  children,
}) {
  if (error) {
    return (
      <EstadoError
        mensaje={typeof error === "string" ? error : ""}
        alReintentar={alReintentar}
      />
    );
  }

  if (cargando) {
    return <EstadoCargando mensaje={mensajeCargando} />;
  }

  if (vacio) {
    return (
      <EstadoVacio
        titulo={tituloVacio}
        mensaje={mensajeVacio}
        accion={accionVacio}
        etiquetaAccion={etiquetaAccionVacio}
      />
    );
  }

  return children ?? null;
}

export { EstadoCargando, EstadoVacio, EstadoError };
export default EstadoPantalla;
