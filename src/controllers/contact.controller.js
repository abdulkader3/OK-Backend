import { Contact, Ledger, AuditLog, User } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const createContact = asyncHandler(async (req, res, _next) => {
  const { name, email, phone, address, notes, tags } = req.body;

  const contact = await Contact.create({
    ownerId: req.user._id,
    name,
    email,
    phone,
    address,
    notes,
    tags: tags || [],
    createdBy: req.user._id,
  });

  await AuditLog.create({
    operation: "create",
    collection: "contacts",
    docId: contact._id,
    userId: req.user._id,
    userEmail: req.user.email,
    after: contact.toObject(),
  });

  res.status(201).json({
    success: true,
    data: { contact },
    message: "Contact created successfully",
  });
});

const getContacts = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};

  const isAdminOrOwner = req.user.role === "owner" || req.user.role === "admin";
  const canViewAll = req.user.permissions?.canViewAllLedgers;

  if (isAdminOrOwner || canViewAll) {
    const companyUsers = await User.find({ company: req.user.company }).select(
      "_id"
    );
    const companyUserIds = companyUsers.map((u) => u._id);
    filter.$or = [
      { ownerId: { $in: companyUserIds } },
      { createdBy: { $in: companyUserIds } },
    ];
  } else {
    filter.$or = [{ ownerId: req.user._id }, { createdBy: req.user._id }];
  }

  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
      { phone: { $regex: req.query.search, $options: "i" } },
      { tags: { $in: [new RegExp(req.query.search, "i")] } },
    ];
  }

  if (req.query.tags) {
    const tagsArray = req.query.tags.split(",").map((t) => t.trim());
    filter.tags = { $in: tagsArray };
  }

  const contacts = await Contact.find(filter)
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .populate("createdBy", "name email");

  const total = await Contact.countDocuments(filter);

  const ledgerAggregation = await Ledger.aggregate([
    {
      $match: {
        counterpartyName: { $in: contacts.map((c) => c.name) },
        ownerId: req.user._id,
      },
    },
    {
      $group: {
        _id: "$counterpartyName",
        totalOwesMe: {
          $sum: {
            $cond: [{ $eq: ["$type", "owes_me"] }, "$outstandingBalance", 0],
          },
        },
        totalIOwe: {
          $sum: {
            $cond: [{ $eq: ["$type", "i_owe"] }, "$outstandingBalance", 0],
          },
        },
        ledgerCount: { $sum: 1 },
      },
    },
  ]);

  const balanceMap = {};
  ledgerAggregation.forEach((item) => {
    balanceMap[item._id] = {
      totalOwesMe: item.totalOwesMe,
      totalIOwe: item.totalIOwe,
      netBalance: item.totalOwesMe - item.totalIOwe,
      ledgerCount: item.ledgerCount,
    };
  });

  const contactsWithBalance = contacts.map((contact) => {
    const balance = balanceMap[contact.name] || {
      totalOwesMe: 0,
      totalIOwe: 0,
      netBalance: 0,
      ledgerCount: 0,
    };
    return {
      ...contact.toObject(),
      balance: balance,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      contacts: contactsWithBalance,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const getContactById = asyncHandler(async (req, res, _next) => {
  const contact = await Contact.findById(req.params.id).populate(
    "createdBy",
    "name email"
  );

  if (!contact) {
    throw new ApiErrors(404, "Contact not found");
  }

  if (
    contact.ownerId.toString() !== req.user._id.toString() &&
    contact.createdBy._id.toString() !== req.user._id.toString() &&
    req.user.role !== "owner" &&
    req.user.role !== "admin"
  ) {
    throw new ApiErrors(403, "Access denied");
  }

  const ledgers = await Ledger.find({
    counterpartyName: contact.name,
    ownerId: req.user._id,
  })
    .sort({ createdAt: -1 })
    .populate("createdBy", "name email");

  const totalOwesMe = ledgers
    .filter((l) => l.type === "owes_me")
    .reduce((sum, l) => sum + l.outstandingBalance, 0);

  const totalIOwe = ledgers
    .filter((l) => l.type === "i_owe")
    .reduce((sum, l) => sum + l.outstandingBalance, 0);

  res.status(200).json({
    success: true,
    data: {
      contact,
      ledgers,
      balance: {
        totalOwesMe,
        totalIOwe,
        netBalance: totalOwesMe - totalIOwe,
      },
    },
  });
});

const updateContact = asyncHandler(async (req, res, _next) => {
  const { name, email, phone, address, notes, tags } = req.body;

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    throw new ApiErrors(404, "Contact not found");
  }

  if (
    contact.ownerId.toString() !== req.user._id.toString() &&
    contact.createdBy.toString() !== req.user._id.toString() &&
    req.user.role !== "owner" &&
    req.user.role !== "admin"
  ) {
    throw new ApiErrors(403, "You don't have permission to edit this contact");
  }

  const before = contact.toObject();

  if (name) contact.name = name;
  if (email !== undefined) contact.email = email;
  if (phone !== undefined) contact.phone = phone;
  if (address !== undefined) contact.address = address;
  if (notes !== undefined) contact.notes = notes;
  if (tags) contact.tags = tags;

  await contact.save();

  const changes = [];
  if (name && before.name !== name) {
    changes.push({ field: "name", oldValue: before.name, newValue: name });
  }
  if (email !== undefined && before.email !== email) {
    changes.push({ field: "email", oldValue: before.email, newValue: email });
  }
  if (phone !== undefined && before.phone !== phone) {
    changes.push({ field: "phone", oldValue: before.phone, newValue: phone });
  }

  await AuditLog.create({
    operation: "update",
    collection: "contacts",
    docId: contact._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before,
    after: contact.toObject(),
    changes,
  });

  res.status(200).json({
    success: true,
    data: { contact },
    message: "Contact updated successfully",
  });
});

const deleteContact = asyncHandler(async (req, res, _next) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    throw new ApiErrors(404, "Contact not found");
  }

  if (
    contact.ownerId.toString() !== req.user._id.toString() &&
    req.user.role !== "owner" &&
    req.user.role !== "admin"
  ) {
    throw new ApiErrors(
      403,
      "You don't have permission to delete this contact"
    );
  }

  const relatedLedgers = await Ledger.countDocuments({
    counterpartyName: contact.name,
    ownerId: req.user._id,
  });

  if (relatedLedgers > 0) {
    throw new ApiErrors(
      400,
      "Cannot delete contact with associated ledgers. Delete the ledgers first or update the contact name instead."
    );
  }

  await Contact.findByIdAndDelete(req.params.id);

  await AuditLog.create({
    operation: "delete",
    collection: "contacts",
    docId: contact._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before: contact.toObject(),
  });

  res.status(200).json({
    success: true,
    message: "Contact deleted successfully",
  });
});

export {
  createContact,
  getContacts,
  getContactById,
  updateContact,
  deleteContact,
};
