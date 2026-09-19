/**
 * Aviso del estado de la suscripción.
 *
 * Una suscripción que vence sin que el cliente se entere es un cliente perdido
 * por descuido. El sistema avisa por correo, pero quien está trabajando tiene
 * que verlo también dentro de la aplicación.
 */

import { contenidoDelAviso } from "../utils/avisoSuscripcion";

function AvisoSuscripcion({ usuario, alRenovar }) {
  const aviso = contenidoDelAviso(usuario?.suscripcion);

  if (!aviso) {
    return null;
  }

  return (
    <div className={`sc-aviso-suscripcion sc-aviso-suscripcion--${aviso.tono}`}>
      <div className="sc-aviso-suscripcion__texto">
        <strong>{aviso.titulo}</strong>
        {aviso.texto ? <span>{aviso.texto}</span> : null}
      </div>

      {alRenovar ? (
        <button type="button" className="sc-btn sc-btn--claro" onClick={alRenovar}>
          {aviso.accion}
        </button>
      ) : null}
    </div>
  );
}

export default AvisoSuscripcion;
