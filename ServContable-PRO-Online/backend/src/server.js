require("dotenv").config();

const { iniciarServidor } = require("./start");

iniciarServidor()
  .then(({ host, port }) => {
    console.log(`Servidor backend funcionando en http://${host}:${port}`);
  })
  .catch((error) => {
    console.error("No se pudo iniciar ServContable:", error);
    process.exit(1);
  });
