import * as organizationService from "../services/organizationService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function create(req, res) {
  try { res.status(201).json(await organizationService.createOrganization(req.user.role, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to create gym"); }
}

export async function getMine(req, res) {
  try { res.json(await organizationService.getMyOrganizations(req.user.id)); }
  catch (err) { sendError(err, res, "Failed to load your gyms"); }
}

export async function getOne(req, res) {
  try { res.json(await organizationService.getOrganization(req.user.id, req.user.role, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to load gym"); }
}

export async function update(req, res) {
  try { res.json(await organizationService.updateOrganization(req.user.id, req.user.role, req.params.id, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to update gym"); }
}

export async function addMember(req, res) {
  try { res.status(201).json(await organizationService.addMember(req.user.id, req.user.role, req.params.id, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to add member"); }
}

export async function removeMember(req, res) {
  try { res.json(await organizationService.removeMember(req.user.id, req.user.role, req.params.id, req.params.userId)); }
  catch (err) { sendError(err, res, "Failed to remove member"); }
}

export async function listMembers(req, res) {
  try { res.json(await organizationService.listMembers(req.user.id, req.user.role, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to load members"); }
}

export async function listCoaches(req, res) {
  try { res.json(await organizationService.listOrgCoaches(req.user.id, req.user.role, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to load coaches"); }
}

export async function listClients(req, res) {
  try { res.json(await organizationService.listOrgClients(req.user.id, req.user.role, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to load clients"); }
}

export async function attachClient(req, res) {
  try { res.json(await organizationService.addExistingClientToOrg(req.user.id, req.user.role, req.params.id, req.params.clientId)); }
  catch (err) { sendError(err, res, "Failed to add client to gym"); }
}

export async function assignCoach(req, res) {
  try { res.status(201).json(await organizationService.assignCoachToClient(req.user.id, req.user.role, req.params.id, { ...req.body, clientId: req.params.clientId })); }
  catch (err) { sendError(err, res, "Failed to assign coach"); }
}

export async function unassignCoach(req, res) {
  try { res.json(await organizationService.unassignCoachFromClient(req.user.id, req.user.role, req.params.id, { ...req.body, clientId: req.params.clientId })); }
  catch (err) { sendError(err, res, "Failed to unassign coach"); }
}

export async function listClientCoaches(req, res) {
  try { res.json(await organizationService.listClientCoaches(req.user.id, req.user.role, req.params.id, req.params.clientId)); }
  catch (err) { sendError(err, res, "Failed to load client's coaches"); }
}
