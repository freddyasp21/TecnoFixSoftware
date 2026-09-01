import { Link } from 'react-router-dom';

export default function RateGate({ action = 'continuar' }) {
  return (
    <div className="mb-6 rounded-2xl border-2 border-rose-400 bg-rose-100 p-5">
      <h2 className="font-semibold text-rose-950">Actualice la tasa del día</h2>
      <p className="mt-1 text-sm text-rose-900">
        Es necesario registrar BCV, Euro y USDT para {action}. Sin la tasa de hoy no se puede abrir caja, cotizar ni crear una orden. Solo el administrador puede actualizarla.
      </p>
      <Link to="/tasas" className="btn-primary mt-4">Ir a Actualizar tasa</Link>
    </div>
  );
}
