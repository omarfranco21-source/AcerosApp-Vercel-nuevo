import React, { useState, useEffect } from 'react';
import { ShoppingCart, Home, User, Package, FileText, MapPin, Check, Plus, Minus, Trash2, Search, ArrowLeft, Save, X, AlertTriangle } from 'lucide-react';

// --- Global variables are provided by the Canvas Environment (MANDATORY) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, serverTimestamp, runTransaction } from 'firebase/firestore';

// Datos iniciales de ejemplo si no hay nada en la base de datos
const INITIAL_PRODUCTS_FALLBACK = [
  { id: 1, name: "Cemento Portland Gris", price: 260.00, unit: "Saco 50kg", category: "Obra Gris", image: "cemento", description: "Cemento de alta resistencia.", specs: { "Resistencia": "30 MPa", "Peso": "50 kg" } },
  { id: 2, name: "Varilla Corrugada 3/8\"", price: 185.50, unit: "Pieza 12m", category: "Aceros", image: "varilla", description: "Acero de refuerzo para estructuras.", specs: { "Diámetro": "3/8\"", "Largo": "12m" } },
];

export default function ConstructionApp() {
  // --- Estados de la App ---
  const [activeTab, setActiveTab] = useState('home'); // home, cart, admin
  const [products, setProducts] = useState([]); // Ahora cargado desde Firestore
  const [cart, setCart] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Estados de Firebase y Autenticación
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [notification, setNotification] = useState({ message: '', type: '' });

  // Estados para Checkout
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [orderPlaced, setOrderPlaced] = useState(false);

  // --- 1. Inicialización y Autenticación de Firebase ---
  useEffect(() => {
    if (Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is missing.");
        setIsAuthReady(true);
        // Usar fallback data si Firebase no está disponible
        setProducts(INITIAL_PRODUCTS_FALLBACK);
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const firestore = getFirestore(app);
        setDb(firestore);

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                // Si no hay token inicial, inicia sesión anónimamente
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    } catch (e) {
        console.error("Error initializing Firebase:", e);
        setIsAuthReady(true);
        setProducts(INITIAL_PRODUCTS_FALLBACK);
    }
  }, []);

  // --- 2. Carga y Escucha de Productos desde Firestore (onSnapshot) ---
  useEffect(() => {
    if (!db || !isAuthReady) return;

    // Ruta de la colección de productos públicos
    const productsCollectionRef = collection(db, `artifacts/${appId}/public/data/products`);
    
    // Escucha en tiempo real
    const unsubscribe = onSnapshot(productsCollectionRef, (snapshot) => {
      const productList = [];
      snapshot.forEach(doc => {
        productList.push({ id: doc.id, ...doc.data() });
      });

      if (productList.length === 0) {
        // Inicializa la base de datos con los datos de fallback si está vacía
        initializeDatabase(productsCollectionRef);
        setProducts(INITIAL_PRODUCTS_FALLBACK);
      } else {
        setProducts(productList);
      }
    }, (error) => {
        console.error("Error fetching products: ", error);
        setNotification({ message: 'Error al cargar el catálogo.', type: 'error' });
    });

    return () => unsubscribe(); // Limpieza del listener
  }, [db, isAuthReady]);

  // Función para inicializar la base de datos con datos de ejemplo
  const initializeDatabase = (collectionRef) => {
    INITIAL_PRODUCTS_FALLBACK.forEach(product => {
      setDoc(doc(collectionRef, String(product.id)), product, { merge: true });
    });
  };

  // --- Lógica del Carrito (Mantenida localmente hasta el checkout) ---
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
    setNotification({ message: `${product.name} agregado al carrito.`, type: 'success' });
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const cartItemsCount = cart.reduce((acc, item) => acc + item.qty, 0);

  // --- Lógica de Admin y Firestore Write ---
  const handleAdminLogin = () => {
    if (adminPin === '1234') { // PIN hardcodeado para la demo
      setIsAdmin(true);
      setAdminPin('');
      setNotification({ message: 'Modo Administrador activado.', type: 'success' });
    } else {
      setNotification({ message: 'PIN Incorrecto (Prueba: 1234)', type: 'error' });
    }
  };

  const updateProductPrice = async (id, newPrice) => {
    if (!isAdmin || !db) return;
    const priceValue = parseFloat(newPrice) || 0;

    try {
      const productRef = doc(db, `artifacts/${appId}/public/data/products`, String(id));
      await setDoc(productRef, { price: priceValue }, { merge: true });
      setNotification({ message: `Precio de producto ${id} actualizado.`, type: 'success' });
    } catch (e) {
      console.error("Error updating price:", e);
      setNotification({ message: 'Error al guardar el precio.', type: 'error' });
    }
  };

  // --- Lógica de Checkout y Guardado de Orden ---
  const placeOrder = async () => {
    if (!address || !phone) {
        setNotification({ message: 'Por favor ingresa la dirección y teléfono.', type: 'error' });
        return;
    }
    if (!db || cart.length === 0) return;

    // Prepara la orden para Firestore
    const orderData = {
      customerId: userId,
      status: 'Pendiente',
      total: cartTotal,
      address: address,
      phone: phone,
      items: cart.map(item => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price,
        unit: item.unit
      })),
      timestamp: serverTimestamp()
    };

    try {
      const ordersCollectionRef = collection(db, `artifacts/${appId}/public/data/orders`);
      const newOrderRef = doc(ordersCollectionRef); // Firestore genera un ID
      await setDoc(newOrderRef, orderData);

      setOrderPlaced(true);
      setAddress('');
      setPhone('');
      // No limpiar el carrito aquí, se limpia al volver a Home
      setNotification({ message: '¡Pedido realizado con éxito!', type: 'success' });
    } catch (e) {
      console.error("Error placing order:", e);
      setNotification({ message: 'Error al enviar el pedido, intenta de nuevo.', type: 'error' });
    }
  };


  // --- Componente de Notificación Temporal ---
  const NotificationToast = () => {
    if (!notification.message) return null;

    useEffect(() => {
      const timer = setTimeout(() => {
        setNotification({ message: '', type: '' });
      }, 3000); // 3 segundos
      return () => clearTimeout(timer);
    }, [notification]);

    const baseStyle = "fixed top-4 left-1/2 -translate-x-1/2 p-4 rounded-xl shadow-lg font-bold z-50 transition-all duration-300 flex items-center gap-2";
    const successStyle = "bg-green-500 text-white";
    const errorStyle = "bg-red-500 text-white";

    return (
      <div className={`${baseStyle} ${notification.type === 'success' ? successStyle : errorStyle}`}>
        {notification.type === 'success' ? <Check size={20} /> : <AlertTriangle size={20} />}
        {notification.message}
      </div>
    );
  };
  
  // --- Icono Helper (Simulación de imágenes) ---
  const ProductIcon = ({ type, className }) => {
    const style = `w-full h-full object-cover text-orange-600 bg-orange-100 p-4 rounded-lg ${className}`;
    if (type === 'cemento') return <Package className={style} />;
    if (type === 'varilla') return <div className={`flex items-center justify-center bg-gray-200 text-gray-600 font-bold rounded-lg ${className}`}>///</div>;
    if (type === 'ladrillo') return <div className={`flex items-center justify-center bg-red-100 text-red-600 rounded-lg ${className}`}>🧱</div>;
    if (type === 'arena') return <div className={`flex items-center justify-center bg-yellow-100 text-yellow-600 rounded-lg ${className}`}>⛰️</div>;
    return <Package className={style} />;
  };

  // --- VISTAS ---

  // 1. Vista Catálogo (Home)
  const HomeView = () => (
    <div className="pb-20 pt-4 px-4 space-y-4">
      {/* Muestra el ID de usuario para debugging (obligatorio) */}
      <p className="text-xs text-center text-gray-400">ID Usuario: {userId || 'Cargando...'}</p>
      
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Catálogo</h2>
          <p className="text-sm text-gray-500">Precios actualizados en tiempo real</p>
        </div>
        <div className="bg-orange-500 text-white p-2 rounded-full">
          <Package size={24} />
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Buscar materiales..." 
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {products.length === 0 && (
            <div className='text-center p-8 text-gray-400'>Cargando productos desde la base de datos...</div>
        )}
        {products.map(product => (
          <div key={product.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex gap-4">
            <div className="w-24 h-24 flex-shrink-0">
              <ProductIcon type={product.image} />
            </div>
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-gray-800">{product.name}</h3>
                  <button 
                    onClick={() => setSelectedProduct(product)}
                    className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1"
                  >
                    <FileText size={12} /> Ficha
                  </button>
                </div>
                <p className="text-sm text-gray-500">{product.category} • {product.unit}</p>
              </div>
              <div className="flex justify-between items-end mt-2">
                <span className="text-lg font-bold text-orange-600">${product.price ? product.price.toFixed(2) : 'N/A'}</span>
                <button 
                  onClick={() => addToCart(product)}
                  className="bg-gray-900 text-white p-2 rounded-lg hover:bg-gray-700 transition-colors active:scale-95"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // 2. Vista Carrito
  const CartView = () => {
    if (orderPlaced) {
      return (
        <div className="flex flex-col items-center justify-center h-screen px-6 text-center pb-20">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
            <Check size={40} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Pedido Recibido!</h2>
          <p className="text-gray-500 mb-8">Hemos registrado tu pedido y pronto nos pondremos en contacto.</p>
          <button 
            onClick={() => { setOrderPlaced(false); setCart([]); setActiveTab('home'); }}
            className="bg-orange-600 text-white py-3 px-8 rounded-xl font-bold w-full"
          >
            Volver al Catálogo
          </button>
        </div>
      );
    }

    if (cart.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-screen pb-20 text-gray-400">
          <ShoppingCart size={64} className="mb-4 opacity-20" />
          <p>Tu carrito está vacío</p>
          <button onClick={() => setActiveTab('home')} className="mt-4 text-orange-600 font-medium">Ir a comprar</button>
        </div>
      );
    }

    return (
      <div className="pb-40 pt-4 px-4 bg-gray-50 min-h-screen">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Tu Pedido</h2>
        
        <div className="space-y-4 mb-8">
          {cart.map(item => (
            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-gray-800">{item.name}</h4>
                <p className="text-sm text-gray-500">${item.price.toFixed(2)} x {item.unit}</p>
                <p className="text-orange-600 font-bold mt-1">${(item.price * item.qty).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-3 bg-gray-100 rounded-lg p-1">
                <button onClick={() => updateQty(item.id, -1)} className="p-2 bg-white rounded-md shadow-sm"><Minus size={16} /></button>
                <span className="font-bold w-4 text-center">{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)} className="p-2 bg-white rounded-md shadow-sm"><Plus size={16} /></button>
              </div>
              <button onClick={() => removeFromCart(item.id)} className="ml-2 text-red-400 p-2"><Trash2 size={20} /></button>
            </div>
          ))}
        </div>

        {/* Sección de Datos de Entrega */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <MapPin size={20} className="text-orange-600" />
            Datos de Entrega
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Dirección Completa</label>
              <textarea 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, Número, Colonia, Referencias..."
                className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:border-orange-500 outline-none text-sm h-24 resize-none"
              ></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Teléfono de contacto</label>
              <input 
                type="tel" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(000) 000-0000"
                className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:border-orange-500 outline-none text-sm"
              />
            </div>
          </div>
        </div>

        {/* Footer del Carrito */}
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-500">Total a Pagar</span>
            <span className="text-2xl font-bold text-gray-900">${cartTotal.toFixed(2)}</span>
          </div>
          <button 
            onClick={placeOrder}
            className="w-full bg-orange-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-orange-200 active:scale-95 transition-transform"
            disabled={!db} // Deshabilita si la base de datos no está lista
          >
            Confirmar Pedido
          </button>
        </div>
      </div>
    );
  };

  // 3. Vista Admin
  const AdminView = () => {
    if (!isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center h-screen px-6 pb-20 bg-gray-50">
          <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm">
            <h2 className="text-xl font-bold text-center mb-6 text-gray-800">Acceso Administrativo</h2>
            <input 
              type="password" 
              placeholder="Ingresa el PIN (1234)" 
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl mb-4 text-center text-lg tracking-widest outline-none focus:border-orange-500 transition-colors"
            />
            <button 
              onClick={handleAdminLogin}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors"
            >
              Entrar
            </button>
            <p className="text-center mt-4 text-xs text-gray-400">Solo para personal autorizado</p>
          </div>
        </div>
      );
    }

    return (
      <div className="pb-24 pt-4 px-4 bg-gray-50 min-h-screen">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Gestión de Precios</h2>
          <button onClick={() => setIsAdmin(false)} className="text-sm text-red-500 font-medium">Cerrar Sesión</button>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800 flex gap-2">
            <User size={16} className="mt-1" />
            <p>Los cambios se guardan automáticamente en la nube (Firestore).</p>
        </div>

        <div className="space-y-4">
          {products.map(product => (
            <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <span className="font-bold text-gray-700">{product.name}</span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{product.category}</span>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-1">Precio Actual ($)</label>
                  <input 
                    type="number" 
                    // Usar un valor por defecto si el precio no se ha cargado aún
                    value={product.price || 0}
                    onChange={(e) => {
                      // Actualiza el estado local inmediatamente
                      setProducts(prev => prev.map(p => 
                        p.id === product.id ? { ...p, price: parseFloat(e.target.value) || 0 } : p
                      ));
                      // Guarda en Firestore después de un breve retraso (debounce)
                      // Nota: En una app real usarías un debounce, aquí se guarda instantáneamente.
                      updateProductPrice(product.id, e.target.value);
                    }}
                    className="w-full p-2 border border-gray-300 rounded-lg font-bold text-gray-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 outline-none"
                  />
                </div>
                <div className="flex items-center justify-center pt-5">
                    <Save size={20} className="text-green-500" />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <button className="w-full mt-8 border-2 border-dashed border-gray-300 text-gray-400 py-4 rounded-xl font-medium hover:bg-gray-50 hover:border-gray-400 hover:text-gray-600 transition-all flex items-center justify-center gap-2" disabled>
            <Plus size={20} /> Agregar Nuevo Producto (Requiere más implementación)
        </button>
      </div>
    );
  };

  // 4. Modal Ficha Técnica
  const TechnicalSheetModal = () => {
    if (!selectedProduct) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="relative h-48 bg-gray-100 flex items-center justify-center">
            <ProductIcon type={selectedProduct.image} className="w-full h-full object-cover opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                <h2 className="text-white text-2xl font-bold shadow-sm">{selectedProduct.name}</h2>
            </div>
            <button 
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 bg-white/90 p-2 rounded-full text-gray-800 hover:bg-white"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="p-6">
            <div className="mb-6">
                <h3 className="text-sm font-bold text-orange-600 uppercase tracking-wide mb-2">Descripción General</h3>
                <p className="text-gray-600 leading-relaxed">{selectedProduct.description}</p>
            </div>

            <h3 className="text-sm font-bold text-orange-600 uppercase tracking-wide mb-3">Especificaciones Técnicas</h3>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              {Object.entries(selectedProduct.specs).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center border-b border-gray-200 last:border-0 pb-2 last:pb-0">
                  <span className="text-gray-500 font-medium">{key}</span>
                  <span className="text-gray-900 font-bold">{value}</span>
                </div>
              ))}
            </div>

            <div className="mt-8">
                <button 
                  onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); }}
                  className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-700"
                >
                    <Plus size={20} /> Agregar al Presupuesto
                </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans bg-white h-screen flex flex-col md:max-w-md md:mx-auto md:border-x md:border-gray-200">
      
      {/* Notificación Toast */}
      <NotificationToast />

      {/* Header Mobile */}
      <header className="px-4 py-3 bg-white border-b border-gray-100 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
            <div className="bg-orange-600 rounded-lg p-1.5">
                <Package className="text-white" size={20} />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-gray-900">ConstruApp</h1>
        </div>
        <div className="relative cursor-pointer" onClick={() => setActiveTab('cart')}>
          <ShoppingCart className="text-gray-700" size={24} />
          {cartItemsCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
              {cartItemsCount}
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar">
        {activeTab === 'home' && <HomeView />}
        {activeTab === 'cart' && <CartView />}
        {activeTab === 'admin' && <AdminView />}
        {!isAuthReady && (
            <div className="flex items-center justify-center p-8 text-orange-600">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Cargando sistema de datos...
            </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 md:relative md:bottom-auto w-full md:w-auto bg-white border-t border-gray-200 flex justify-around py-3 px-2 z-20 pb-safe">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'home' ? 'text-orange-600 bg-orange-50 w-20' : 'text-gray-400'}`}
        >
          <Home size={24} />
          <span className="text-[10px] font-bold mt-1">Catálogo</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('cart')}
          className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'cart' ? 'text-orange-600 bg-orange-50 w-20' : 'text-gray-400'}`}
        >
          <ShoppingCart size={24} />
          <span className="text-[10px] font-bold mt-1">Carrito</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('admin')}
          className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'admin' ? 'text-orange-600 bg-orange-50 w-20' : 'text-gray-400'}`}
        >
          <User size={24} />
          <span className="text-[10px] font-bold mt-1">Admin</span>
        </button>
      </nav>

      {/* Modales */}
      <TechnicalSheetModal />
    </div>
  );
}