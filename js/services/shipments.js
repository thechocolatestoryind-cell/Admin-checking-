import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, limit, serverTimestamp } from "../firebase.js";
import { COL } from "../collections.js";
import { assertOnline } from "./util.js";
import { byNewest } from "./order-logic.js";

const withId = d => ({ id: d.id, ...d.data() });
export async function listShipments() { return (await getDocs(collection(db, COL.shipments))).docs.map(withId).sort(byNewest); }
export async function shipmentsForOrder(orderId) { return (await getDocs(query(collection(db, COL.shipments), where("orderId", "==", orderId), limit(20)))).docs.map(withId).sort(byNewest); }
export async function createShipment(data) { assertOnline(); return (await addDoc(collection(db, COL.shipments), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })).id; }
export async function updateShipment(id, patch) { assertOnline(); await updateDoc(doc(db, COL.shipments, id), { ...patch, updatedAt: serverTimestamp() }); }
export async function deleteShipment(id) { assertOnline(); await deleteDoc(doc(db, COL.shipments, id)); }
