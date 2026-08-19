/**
 * D' Carela POS - Firebase Adapter
 * Bridge for Firebase Authentication and Cloud Firestore.
 * Supports both standalone Firebase operation and hybrid backend coexistence.
 */
(function() {
  'use strict';

  const cfg = window.__DCARELA_FIREBASE_CONFIG || {
    apiKey: "AIzaSyDqcLYgNqjgkib666vQDQjP5SmDbXAcUVE",
    authDomain: "erikccarela.firebaseapp.com",
    projectId: "erikccarela",
    storageBucket: "erikccarela.firebasestorage.app",
    messagingSenderId: "1025242292135",
    appId: "1:1025242292135:web:22faf94cf230f9ab05e082",
    measurementId: "G-H16J1ZZH7L"
  };

  let app = null;
  let auth = null;
  let db = null;
  let initialized = false;

  function initFirebase() {
    if (initialized) return { app, auth, db };
    try {
      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        if (!firebase.apps || !firebase.apps.length) {
          app = firebase.initializeApp(cfg);
        } else {
          app = firebase.app();
        }
        auth = firebase.auth();
        db = firebase.firestore();
        // Enable offline persistence if available
        if (db && db.enablePersistence) {
          db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
              console.warn('Firestore persistence warning:', err);
            }
          });
        }
        initialized = true;
      }
    } catch (e) {
      console.warn('Firebase initialization notice:', e.message);
    }
    return { app, auth, db };
  }

  // Auto-init on script load if SDK is present
  initFirebase();

  const DcarelaFirebase = {
    get isAvailable() {
      if (!initialized) initFirebase();
      return !!(app && auth && db);
    },
    get config() {
      return cfg;
    },
    get app() {
      if (!initialized) initFirebase();
      return app;
    },
    get auth() {
      if (!initialized) initFirebase();
      return auth;
    },
    get db() {
      if (!initialized) initFirebase();
      return db;
    },

    // Authentication methods
    async signIn(email, password) {
      const { auth: a } = initFirebase();
      if (!a) throw new Error('Firebase Auth no inicializado.');
      return a.signInWithEmailAndPassword(email.trim(), password);
    },

    async signOut() {
      const { auth: a } = initFirebase();
      if (!a) return;
      return a.signOut();
    },

    getCurrentUser() {
      const { auth: a } = initFirebase();
      return a ? a.currentUser : null;
    },

    onAuthStateChanged(callback) {
      const { auth: a } = initFirebase();
      if (!a) return () => {};
      return a.onAuthStateChanged(callback);
    },

    // Firestore Generic CRUD
    async getCollection(collectionName, conditions = []) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      let q = d.collection(collectionName);
      for (const cond of conditions) {
        if (Array.isArray(cond) && cond.length === 3) {
          q = q.where(cond[0], cond[1], cond[2]);
        }
      }
      const snap = await q.get();
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getDocument(collectionName, docId) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      const doc = await d.collection(collectionName).doc(docId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    },

    async setDocument(collectionName, docId, data, merge = true) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      await d.collection(collectionName).doc(docId).set({
        ...data,
        updated_at: new Date().toISOString()
      }, { merge });
      return { id: docId, ...data };
    },

    async addDocument(collectionName, data) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      const ref = await d.collection(collectionName).add({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return { id: ref.id, ...data };
    },

    async updateDocument(collectionName, docId, data) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      await d.collection(collectionName).doc(docId).update({
        ...data,
        updated_at: new Date().toISOString()
      });
      return { id: docId, ...data };
    },

    async deleteDocument(collectionName, docId) {
      const { db: d } = initFirebase();
      if (!d) throw new Error('Firestore no inicializado.');
      return d.collection(collectionName).doc(docId).delete();
    },

    listenCollection(collectionName, conditions = [], callback) {
      const { db: d } = initFirebase();
      if (!d) return () => {};
      let q = d.collection(collectionName);
      for (const cond of conditions) {
        if (Array.isArray(cond) && cond.length === 3) {
          q = q.where(cond[0], cond[1], cond[2]);
        }
      }
      return q.onSnapshot(snap => {
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(items);
      }, err => {
        console.warn(`Firestore listener error on ${collectionName}:`, err);
      });
    },

    // Domain Specific Helpers
    async getBusinesses() {
      return this.getCollection('businesses', [['active', '==', true]]);
    },

    async getProducts(businessId = 'dcarela') {
      return this.getCollection('products', [['business_id', '==', businessId]]);
    },

    async getSales(businessId = 'dcarela', limit = 100) {
      const { db: d } = initFirebase();
      if (!d) return [];
      const snap = await d.collection('sales')
        .where('business_id', '==', businessId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .get();
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getCashShifts(businessId = 'dcarela', limit = 50) {
      const { db: d } = initFirebase();
      if (!d) return [];
      const snap = await d.collection('cash_shifts')
        .where('business_id', '==', businessId)
        .orderBy('opened_at', 'desc')
        .limit(limit)
        .get();
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getFinanceAccounts(businessId = 'dcarela') {
      return this.getCollection('fin_accounts', [['business_id', '==', businessId]]);
    },

    async getFinanceMovements(businessId = 'dcarela', month = null) {
      const { db: d } = initFirebase();
      if (!d) return [];
      let q = d.collection('fin_movements').where('business_id', '==', businessId);
      if (month) {
        const start = `${month}-01`;
        const end = `${month}-31T23:59:59`;
        q = q.where('fecha', '>=', start).where('fecha', '<=', end);
      }
      const snap = await q.orderBy('fecha', 'desc').get();
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  };

  window.DcarelaFirebase = DcarelaFirebase;
  window.dcInitFirebase = initFirebase;
})();
