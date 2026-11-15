# Guía de Ejecución y Compilación en Windows — MyVirtualCommunity

Esta guía documenta el flujo de trabajo completo para ejecutar, compilar, configurar y solucionar problemas de **MyVirtualCommunity** en sistemas operativos Windows x64 de forma autónoma, sin requerir la apertura continua de Unity Hub o el Editor de Unity.

---

## 1. Arquitectura del Sistema

MyVirtualCommunity se basa en una arquitectura desacoplada y modular:

* **World Core (Backend Autoritativo)**: Desarrollado en TypeScript/Node.js. Mantiene la verdad absoluta del mundo (persistencia en `data/world-state.json`, reloj de simulación, economía, catálogo de Wing Spot, comportamiento cognitivo y presencia de Elena Morales). Expone endpoints REST en `http://127.0.0.1:3000`. Esquema actual: **Versión 19**.
* **Cliente de Presentación 3D (Unity 6.3 LTS)**: Cliente standalone compilado en C# / Universal Render Pipeline (URP). Es **estrictamente de presentación**. No inventa ni autoriza mutaciones de estado en local. Se comunica con el backend mediante `WorldCoreClient.cs` sincronizando las entidades y visualizaciones en la escena vertical `GomezMorinSlice`.

---

## 2. Requisitos del Sistema

* **Sistema Operativo**: Windows 10 / Windows 11 (64 bits).
* **Entorno de Ejecución**:
  * Node.js v20.x o superior con `npx` y `tsx`.
  * Gráficos compatibles con DirectX 11 o DirectX 12.
* **Entorno de Compilación (solo para recompilar el cliente Unity)**:
  * Unity 6.3 LTS (versión `6000.3.25f1` instalada mediante Unity Hub con módulo *Windows Build Support (Mono)*).
  * .NET SDK / Visual Studio Build Tools para validación C#.

---

## 3. Cómo Jugar en Un Solo Clic

Existen múltiples vías equivalentes para iniciar una sesión de juego:

### Opción A — Acceso Directo de Escritorio (Recomendado)
Hacer doble clic en el acceso directo creado en el escritorio de Windows:
```
[Escritorio] -> MyVirtualCommunity.lnk
```

### Opción B — Archivo Batch en la Raíz
Navegar a la carpeta raíz del proyecto y hacer doble clic en:
```
Launch-MyVirtualCommunity.bat
```

### Opción C — PowerShell o Terminal
Desde PowerShell en la raíz del repositorio:
```powershell
.\scripts\launch-windows.ps1
```

### Opción D — Scripts npm
Desde la terminal:
```bash
npm run launch:windows
```

---

## 4. Detección Inteligente del Backend y Ciclo de Vida

El iniciador (`scripts/launch-windows.ps1`) implementa una gestión integral de procesos:

1. **Sondeo de Preparación (`/api/status`)**: Antes de lanzar el ejecutable gráfico, el iniciador consulta `http://127.0.0.1:3000/api/status`.
2. **Reutilización de Backend Existente**:
   * Si ya existe un backend activo (por ejemplo, si el desarrollador inició previamente `npm run dev`), el lanzador lo detecta, valida la versión de esquema (`19`) y el tiempo del mundo, y conecta directamente.
   * Al cerrar el juego, **el backend previo no se interrumpe** y continúa ejecutándose con normalidad.
3. **Inicio Automático y Control de Huérfanos**:
   * Si no hay ningún backend activo, el iniciador arranca el servidor (`npx tsx src/index.ts`) en segundo plano y redirige la salida a `logs/world-core-backend.log`.
   * Espera a que el endpoint responda HTTP 200 con éxito antes de abrir la ventana de Unity.
   * Cuando el usuario sale del juego (cerrando la ventana o presionando Alt+F4), el iniciador intercepta la salida y **detiene limpiamente el proceso de Node.js generado** mediante cierre de árbol de procesos, garantizando que no queden procesos zombis u huérfanos.

---

## 5. Parámetros Avanzados de Lanzamiento

El script `scripts/launch-windows.ps1` admite parámetros configurables para sesiones avanzadas o pruebas:

| Parámetro | Descripción | Ejemplo de Uso |
| :--- | :--- | :--- |
| `-ActiveHours` | Inicia el World Core con simulación de horarios comerciales activos (`--preset-active-hours`). | `.\scripts\launch-windows.ps1 -ActiveHours` |
| `-ServerPort <puerto>` | Especifica un puerto TCP alternativo (por defecto `3000`). | `.\scripts\launch-windows.ps1 -ServerPort 3005` |
| `-ServerUrl <url>` | Especifica una dirección de backend remota o alternativa. | `.\scripts\launch-windows.ps1 -ServerUrl "http://192.168.1.50:3000"` |
| `-SkipBackend` | Omite la comprobación o arranque del backend (para depurar cliente puro). | `.\scripts\launch-windows.ps1 -SkipBackend` |
| `-ExePath <ruta>` | Permite ejecutar un binario standalone alternativo. | `.\scripts\launch-windows.ps1 -ExePath "Builds/Test/MyVirtualCommunity.exe"` |

---

## 6. Flujo de Recompilación (Rebuild Standalone)

Para reconstruir la aplicación tras realizar modificaciones en el código C# o en los componentes de la escena:

### Recompilación por Línea de Comandos (PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```
O con limpieza previa del directorio de salida:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1 -Clean
```

### Recompilación mediante npm
```bash
npm run build:windows
```

### Recompilación desde Unity Editor
Si se encuentra abierto el proyecto en el Editor de Unity:
* Seleccionar en la barra superior: **Build -> Build Windows x64**.

### Ubicación y Estructura del Build
Los binarios se generan en una carpeta dedicada fuera de `Assets`:
```
MyVirtualCommunity/
└── Builds/
    └── Windows/
        ├── MyVirtualCommunity.exe             # Ejecutable principal x64
        ├── UnityPlayer.dll                    # Runtime player de Unity 6.3
        ├── UnityCrashHandler64.exe            # Manejador de fallos nativo
        ├── D3D12/                             # Binarios de render DirectX 12
        ├── MonoBleedingEdge/                  # Runtime de scripting Mono
        └── MyVirtualCommunity_Data/           # Assets serializados y escena GomezMorinSlice
```

---

## 7. Creación y Restauración del Acceso Directo de Escritorio

Si se elimina o se desea regenerar el acceso directo en el escritorio:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-desktop-shortcut.ps1
```
O con npm:
```bash
npm run shortcut:desktop
```
El script utiliza `WScript.Shell` (no requiere privilegios de administrador), configura el icono del juego y establece el directorio de trabajo en la raíz del proyecto.

---

## 8. Controles y Jugabilidad

Dentro de la escena Gómez Morín:

* **Movimiento**: Teclas `W`, `A`, `S`, `D` o flechas direccionales.
* **Correr**: Mantener presionada la tecla `Shift`.
* **Cámara en Tercera Persona**:
  * Mover el ratón manteniendo presionado el botón derecho para orbitar horizontal y verticalmente.
  * Rueda del ratón para acercar o alejar el zoom de la cámara.
* **Interacción (Wing Spot y Elena Morales)**:
  * Acercarse a la entrada de Wing Spot para franquear la puerta automáticamente.
  * Acercarse a Elena Morales en el mostrador de servicio y presionar `E` para iniciar el diálogo, consultar el menú de alitas y boneless, y realizar pedidos autoritativos.

---

## 9. Diagnóstico y Solución de Problemas (Troubleshooting)

### A. "Backend process exited prematurely" o Timeout en el inicio
* **Causa**: Fallo en la inicialización de Node.js o conflicto de dependencias.
* **Solución**: Revisar el archivo de registro `logs/world-core-backend.log`. Verificar que `node_modules` esté actualizado ejecutando `npm install`.

### B. "Puerto 3000 ocupado" (EADDRINUSE)
* **Causa**: Otro servicio o proceso huérfano está escuchando en el puerto 3000.
* **Diagnóstico en PowerShell**:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Format-Table LocalAddress, LocalPort, OwningProcess
  ```
* **Solución**: Finalizar el proceso conflictivo (`Stop-Process -Id <PID> -Force`) o iniciar MyVirtualCommunity en otro puerto con `-ServerPort 3001`.

### C. "Unity Editor executable was not found"
* **Causa**: Unity 6.3 LTS está instalado en una ruta no estándar.
* **Solución**: Establecer la variable de entorno o pasar el parámetro explícito:
  ```powershell
  $env:UNITY_PATH = "D:\Unity\Hub\Editor\6000.3.25f1\Editor\Unity.exe"
  .\scripts\build-windows.ps1 -UnityPath $env:UNITY_PATH
  ```

### D. Problemas de Renderizado o Fallo al Abrir la Ventana de Juego
* **Diagnóstico**: Consultar el registro nativo de Unity en:
  `%USERPROFILE%\AppData\LocalLow\DefaultCompany\unity-client\Player.log`
* Comprobar que los controladores gráficos de NVIDIA/AMD/Intel sean compatibles con DirectX 11 o DirectX 12.

### E. Integridad de Persistencia
* La persistencia del mundo reside en `data/world-state.json`. El proceso de build y los launchers **nunca modifican ni borran** este archivo. No eliminar este archivo a menos que se desee reiniciar el mundo a su estado semilla inicial.
