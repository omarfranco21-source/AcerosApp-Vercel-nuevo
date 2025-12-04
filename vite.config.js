import { defineConfig } from 'vite';

export default defineConfig({
  // Establece el directorio raíz del proyecto
  // Esto le dice a Vite que busque 'index.html' en la carpeta principal
  root: './',
  // Configuración del plugin de React (necesario para procesar App.jsx)
  plugins: [], // Dejamos vacío ya que no usamos plugins complejos
  // Configuración de resolución de módulos si fuera necesario (no lo es ahora)
  resolve: {
    alias: {
      './App.jsx': '/App.jsx'
    }
  },
  // Base de la URL para evitar problemas de rutas relativas
  base: './',
});