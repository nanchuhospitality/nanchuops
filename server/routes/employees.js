const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Import account code generation function
const getCategoryPrefix = (category) => {
  const prefixes = {
    'asset': 1,
    'liability': 2,
    'equity': 3,
    'income': 4,
    'expense': 5
  };
  return prefixes[category] || 1;
};

const generateAccountCode = async (db, category) => {
  try {
    const prefix = getCategoryPrefix(category);
    const prefixStr = prefix.toString();
    
    const result = await db.query(
      `SELECT account_code FROM chart_of_accounts 
       WHERE category = $1 AND account_code LIKE $2 
       ORDER BY CAST(account_code AS INTEGER) DESC 
       LIMIT 1`,
      [category, prefixStr + '%']
    );
    
    let nextNumber = 1;
    
    if (result.rows.length > 0) {
      const lastCode = result.rows[0].account_code;
      const lastNumber = parseInt(lastCode.substring(prefixStr.length)) || 0;
      nextNumber = lastNumber + 1;
    }
    
    return prefixStr + String(nextNumber).padStart(3, '0');
  } catch (error) {
    throw error;
  }
};

const parseBooleanFlag = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return 1;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return 0;
  }
  return defaultValue;
};
const UNIVERSAL_RIDER_POSITION = 'Rider';
const normalizeEmployeePost = (value) => {
  if (value === undefined || value === null) return value;
  const trimmed = String(value).trim();
  if (!trimmed) return trimmed;
  return trimmed.toLowerCase() === 'rider' ? UNIVERSAL_RIDER_POSITION : trimmed;
};

const resolveEffectiveBranchId = async (db, user) => {
  if (!user) return null;
  if (user.branch_id) return parseInt(user.branch_id, 10);
  const userResult = await db.query('SELECT branch_id FROM users WHERE id = $1', [user.id]);
  if (userResult.rows.length === 0 || !userResult.rows[0].branch_id) {
    return null;
  }
  return parseInt(userResult.rows[0].branch_id, 10);
};

const router = express.Router();

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '../uploads/employee-ids');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    if (file.fieldname === 'driving_license_document') {
      cb(null, 'driving-license-' + uniqueSuffix + path.extname(file.originalname));
    } else {
      cb(null, 'employee-id-' + uniqueSuffix + path.extname(file.originalname));
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG) and PDF files are allowed'));
    }
  }
});

// Get all employees
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    let query = `
      SELECT e.*, b.name AS branch_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
    `;
    const params = [];
    let paramIndex = 1;

    const conditions = [];

    if (req.user.role === 'branch_admin') {
      const branchId = await resolveEffectiveBranchId(db, req.user);
      if (!branchId) {
        return res.status(403).json({ error: 'Branch admin must be assigned to a branch' });
      }
      conditions.push(`e.branch_id = $${paramIndex++}`);
      params.push(branchId);
    }

    if (req.user.role === 'night_manager') {
      const branchId = await resolveEffectiveBranchId(db, req.user);
      if (!branchId) {
        return res.status(403).json({ error: 'Night manager must be assigned to a branch' });
      }
      conditions.push(`e.branch_id = $${paramIndex++}`);
      params.push(branchId);
      conditions.push(`LOWER(e.post) = $${paramIndex++}`);
      params.push('rider');
    }

    // Filter by payroll-eligible (in_payroll = 1)
    if (req.query.in_payroll === '1' || req.query.in_payroll === 'true') {
      conditions.push(`e.in_payroll = $${paramIndex}`);
      params.push(1);
      paramIndex++;
    }
    
    // Filter by active status: is_active=0 for past employees, default is_active=1 for current
    const isActive = req.query.is_active === '0' ? 0 : 1;
    conditions.push(`e.is_active = $${paramIndex}`);
    params.push(isActive);
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY e.name ASC';
    
    const result = await db.query(query, params);
    res.json({ employees: result.rows });
  } catch (error) {
    console.error('Error in GET /api/employees:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Get employee by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();

    const result = await db.query(
      `SELECT e.*, b.name AS branch_name
       FROM employees e
       LEFT JOIN branches b ON e.branch_id = b.id
       WHERE e.id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = result.rows[0];
    if (req.user.role === 'branch_admin') {
      const branchId = await resolveEffectiveBranchId(db, req.user);
      if (!branchId || employee.branch_id !== branchId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    if (req.user.role === 'night_manager') {
      const branchId = await resolveEffectiveBranchId(db, req.user);
      if (!branchId || employee.branch_id !== branchId || employee.post?.toLowerCase() !== 'rider') {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    res.json({ employee });
  } catch (error) {
    console.error('Error in GET /api/employees/:id:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Toggle employee in_payroll (admin only). Inactive employees cannot be added to salary records.
router.put('/:id/payroll', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { in_payroll } = req.body;
    const value = in_payroll === true || in_payroll === 1 || in_payroll === '1' ? 1 : 0;

    if (value === 1) {
      const check = await db.query('SELECT is_active FROM employees WHERE id = $1', [req.params.id]);
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      if (check.rows[0].is_active !== 1) {
        return res.status(400).json({ error: 'Cannot add inactive employees to salary records' });
      }
    }

    const result = await db.query(
      'UPDATE employees SET in_payroll = $1 WHERE id = $2 RETURNING *',
      [value, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ employee: result.rows[0] });
  } catch (error) {
    console.error('Error in PUT /api/employees/:id/payroll:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Reactivate employee (admin only) - move from past back to current
router.put('/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE employees SET is_active = 1 WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ employee: result.rows[0] });
  } catch (error) {
    console.error('Error in PUT /api/employees/:id/activate:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Create new employee (admin, branch admin, or night manager)
router.post('/',
  authenticateToken,
  (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'branch_admin' && req.user.role !== 'night_manager') {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  },
  upload.fields([
    { name: 'id_document', maxCount: 1 },
    { name: 'driving_license_document', maxCount: 1 }
  ]),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('joining_date').trim().notEmpty().withMessage('Joining date is required'),
    body('post').trim().notEmpty().withMessage('Position is required'),
    body('date_of_birth').trim().notEmpty().withMessage('Date of birth is required'),
    body('branch_id').optional({ nullable: true }).isInt().withMessage('Branch ID must be an integer'),
    body('citizenship_number').optional().trim(),
    body('citizenship_issued_by').optional().trim(),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
    body('permanent_address').optional().trim(),
    body('temporary_address').optional().trim(),
    body('salary').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Salary must be a positive number'),
    body('emergency_contact_name').optional().trim(),
    body('emergency_contact_number').optional().trim(),
    body('emergency_contact_relation').optional().trim(),
    body('citizenship_issued_date').optional().trim(),
    body('driving_license_number').optional().trim(),
    body('notes').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Delete uploaded files if validation fails
        if (req.files) {
          Object.values(req.files).flat().forEach(file => {
            if (file && file.path) fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, phone, email, permanent_address, temporary_address, receives_transportation, salary, emergency_contact_name, emergency_contact_number, emergency_contact_relation, bank_name, bank_account_number, joining_date, post, date_of_birth, branch_id, citizenship_number, citizenship_issued_by, citizenship_issued_date, driving_license_number, notes } = req.body;
      const db = getDb();
      const receivesTransportationValue = parseBooleanFlag(receives_transportation, 0);
      const effectivePost = req.user.role === 'night_manager'
        ? UNIVERSAL_RIDER_POSITION
        : normalizeEmployeePost(post);
      let effectiveBranchId = null;

      if (req.user.role === 'admin') {
        if (branch_id === undefined || branch_id === null || String(branch_id).trim() === '') {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(400).json({ error: 'Branch is required' });
        }
        effectiveBranchId = parseInt(branch_id, 10);
      } else {
        effectiveBranchId = await resolveEffectiveBranchId(db, req.user);
        if (!effectiveBranchId) {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(403).json({ error: 'User must be assigned to a branch' });
        }
      }

      // Rider-specific requirement
      if (effectivePost && effectivePost.toLowerCase() === 'rider') {
        if (!driving_license_number || driving_license_number.trim() === '') {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(400).json({ error: 'Driving license number is required for rider position' });
        }
      } else if (!citizenship_number || citizenship_number.trim() === '') {
        if (req.files) {
          Object.values(req.files).flat().forEach(file => {
            if (file && file.path) fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({ error: 'Citizenship number is required for non-rider positions' });
      }
      
      // If night_manager, ensure they can only create riders
      if (req.user.role === 'night_manager') {
        if (!effectivePost || effectivePost.toLowerCase() !== 'rider') {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(403).json({ error: 'Night manager can only create employees with rider position' });
        }
      }
      
      const idDocumentPath = req.files?.id_document?.[0] ? `/uploads/employee-ids/${req.files.id_document[0].filename}` : null;
      const drivingLicenseDocumentPath = req.files?.driving_license_document?.[0] ? `/uploads/employee-ids/${req.files.driving_license_document[0].filename}` : null;

      // Insert employee
      const insertResult = await db.query(
        'INSERT INTO employees (name, phone, email, permanent_address, temporary_address, receives_transportation, salary, emergency_contact_name, emergency_contact_number, emergency_contact_relation, bank_name, bank_account_number, joining_date, post, date_of_birth, citizenship_number, citizenship_issued_by, citizenship_issued_date, id_document_path, driving_license_number, driving_license_document_path, notes, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING id',
        [
          name,
          phone || null,
          email || null,
          permanent_address || null,
          temporary_address || null,
          receivesTransportationValue,
          salary ? parseFloat(salary) : 0,
          emergency_contact_name || null,
          emergency_contact_number || null,
          emergency_contact_relation || null,
          bank_name || null,
          bank_account_number || null,
          joining_date || null,
          effectivePost || null,
          date_of_birth || null,
          citizenship_number || null,
          citizenship_issued_by || null,
          citizenship_issued_date || null,
          idDocumentPath,
          driving_license_number || null,
          drivingLicenseDocumentPath,
          notes || null,
          effectiveBranchId
        ]
      );

      const employeeId = insertResult.rows[0].id;
      
      // Create chart of accounts entry for the employee
      try {
        const accountCode = await generateAccountCode(db, 'expense');
        const accountName = `${name} - Salary`;
        
        await db.query(
          'INSERT INTO chart_of_accounts (account_name, account_code, category, subcategory, opening_balance, description) VALUES ($1, $2, $3, $4, $5, $6)',
          [accountName, accountCode, 'expense', 'salary', 0, `Salary account for employee: ${name}`]
        );
        
        console.log(`Created salary account ${accountCode} for employee: ${name}`);
      } catch (accountErr) {
        console.error('Error creating chart of accounts entry for employee:', accountErr);
        // Don't fail the employee creation if account creation fails
      }
      
      // Fetch and return the created employee
      const employeeResult = await db.query(
        `SELECT e.*, b.name AS branch_name
         FROM employees e
         LEFT JOIN branches b ON e.branch_id = b.id
         WHERE e.id = $1`,
        [employeeId]
      );
      res.status(201).json({ employee: employeeResult.rows[0] });
    } catch (error) {
      console.error('Error in POST /api/employees:', error);
      // Delete uploaded files if database insert fails
      if (req.files) {
        Object.values(req.files).flat().forEach(file => {
          if (file && file.path) {
            try {
              fs.unlinkSync(file.path);
            } catch (unlinkErr) {
              console.error('Error deleting uploaded file:', unlinkErr);
            }
          }
        });
      }
      res.status(500).json({ error: 'Error creating employee: ' + error.message });
    }
  }
);

// Update employee
router.put('/:id',
  authenticateToken,
  (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'branch_admin' && req.user.role !== 'night_manager') {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  },
  upload.fields([
    { name: 'id_document', maxCount: 1 },
    { name: 'driving_license_document', maxCount: 1 }
  ]),
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().trim(),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
    body('permanent_address').optional().trim(),
    body('temporary_address').optional().trim(),
    body('salary').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Salary must be a positive number'),
    body('emergency_contact_name').optional().trim(),
    body('emergency_contact_number').optional().trim(),
    body('emergency_contact_relation').optional().trim(),
    body('bank_name').optional().trim(),
    body('bank_account_number').optional().trim(),
    body('joining_date').optional().trim(),
    body('branch_id').optional({ nullable: true }).isInt().withMessage('Branch ID must be an integer'),
    body('notes').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        if (req.files) {
          Object.values(req.files).flat().forEach(file => {
            if (file && file.path) fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({ errors: errors.array() });
      }

      const db = getDb();
      const { name, phone, email, permanent_address, temporary_address, receives_transportation, salary, emergency_contact_name, emergency_contact_number, emergency_contact_relation, bank_name, bank_account_number, joining_date, post, date_of_birth, branch_id, citizenship_number, citizenship_issued_by, citizenship_issued_date, driving_license_number, notes } = req.body;

      // Check if employee exists
      const employeeResult = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
      
      if (employeeResult.rows.length === 0) {
        if (req.files) {
          Object.values(req.files).flat().forEach(file => {
            if (file && file.path) fs.unlinkSync(file.path);
          });
        }
        return res.status(404).json({ error: 'Employee not found' });
      }

      const employee = employeeResult.rows[0];
      const normalizedExistingPost = normalizeEmployeePost(employee.post || '');

      // Position is immutable after employee creation.
      if (post !== undefined) {
        const normalizedRequestedPost = normalizeEmployeePost(post || '');
        if (
          normalizedRequestedPost &&
          normalizedExistingPost &&
          normalizedRequestedPost.toLowerCase() !== normalizedExistingPost.toLowerCase()
        ) {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(400).json({ error: 'Position cannot be changed after employee creation' });
        }
      }

      const nextPost = post !== undefined ? normalizeEmployeePost(post) : employee.post;
      const nextDrivingLicenseNumber = driving_license_number !== undefined
        ? (driving_license_number || '').trim()
        : (employee.driving_license_number || '').trim();
      const nextCitizenshipNumber = citizenship_number !== undefined
        ? (citizenship_number || '').trim()
        : (employee.citizenship_number || '').trim();

      if (req.user.role === 'branch_admin') {
        const branchId = await resolveEffectiveBranchId(db, req.user);
        if (!branchId) {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(403).json({ error: 'Branch admin must be assigned to a branch' });
        }
        if (employee.branch_id !== branchId) {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(403).json({ error: 'You can only update employees in your own branch' });
        }
      }

      if (req.user.role === 'night_manager') {
        const branchId = await resolveEffectiveBranchId(db, req.user);
        if (!branchId) {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(403).json({ error: 'Night manager must be assigned to a branch' });
        }
        if (employee.branch_id !== branchId || employee.post?.toLowerCase() !== 'rider') {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(403).json({ error: 'Night manager can only update riders in own branch' });
        }
      }

      // Validate document-number requirement against final position after edit.
      if (nextPost && nextPost.toLowerCase() === 'rider') {
        if (!nextDrivingLicenseNumber) {
          if (req.files) {
            Object.values(req.files).flat().forEach(file => {
              if (file && file.path) fs.unlinkSync(file.path);
            });
          }
          return res.status(400).json({ error: 'Driving license number is required for rider position' });
        }
      } else if (!nextCitizenshipNumber) {
        if (req.files) {
          Object.values(req.files).flat().forEach(file => {
            if (file && file.path) fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({ error: 'Citizenship number is required for non-rider positions' });
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(phone);
      }
      if (email !== undefined) {
        updates.push(`email = $${paramCount++}`);
        values.push(email);
      }
      if (permanent_address !== undefined) {
        updates.push(`permanent_address = $${paramCount++}`);
        values.push(permanent_address);
      }
      if (temporary_address !== undefined) {
        updates.push(`temporary_address = $${paramCount++}`);
        values.push(temporary_address);
      }
      if (receives_transportation !== undefined) {
        updates.push(`receives_transportation = $${paramCount++}`);
        values.push(parseBooleanFlag(receives_transportation, 0));
      }
      if (salary !== undefined) {
        updates.push(`salary = $${paramCount++}`);
        values.push(parseFloat(salary) || 0);
      }
      if (emergency_contact_name !== undefined) {
        updates.push(`emergency_contact_name = $${paramCount++}`);
        values.push(emergency_contact_name);
      }
      if (emergency_contact_number !== undefined) {
        updates.push(`emergency_contact_number = $${paramCount++}`);
        values.push(emergency_contact_number);
      }
      if (emergency_contact_relation !== undefined) {
        updates.push(`emergency_contact_relation = $${paramCount++}`);
        values.push(emergency_contact_relation);
      }
      if (bank_name !== undefined) {
        updates.push(`bank_name = $${paramCount++}`);
        values.push(bank_name);
      }
      if (bank_account_number !== undefined) {
        updates.push(`bank_account_number = $${paramCount++}`);
        values.push(bank_account_number);
      }
      if (joining_date !== undefined) {
        updates.push(`joining_date = $${paramCount++}`);
        values.push(joining_date);
      }
      if (date_of_birth !== undefined) {
        updates.push(`date_of_birth = $${paramCount++}`);
        values.push(date_of_birth);
      }
      if (branch_id !== undefined && req.user.role === 'admin') {
        updates.push(`branch_id = $${paramCount++}`);
        values.push(branch_id === null || String(branch_id).trim() === '' ? null : parseInt(branch_id, 10));
      }
      if (citizenship_number !== undefined) {
        updates.push(`citizenship_number = $${paramCount++}`);
        values.push(citizenship_number);
      }
      if (citizenship_issued_by !== undefined) {
        updates.push(`citizenship_issued_by = $${paramCount++}`);
        values.push(citizenship_issued_by);
      }
      if (citizenship_issued_date !== undefined) {
        updates.push(`citizenship_issued_date = $${paramCount++}`);
        values.push(citizenship_issued_date);
      }
      if (driving_license_number !== undefined) {
        updates.push(`driving_license_number = $${paramCount++}`);
        values.push(driving_license_number);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${paramCount++}`);
        values.push(notes);
      }
      
      // Handle file uploads
      if (req.files?.id_document?.[0]) {
        // Delete old file if it exists
        if (employee.id_document_path) {
          const oldFilePath = path.join(__dirname, '..', employee.id_document_path);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        updates.push(`id_document_path = $${paramCount++}`);
        values.push(`/uploads/employee-ids/${req.files.id_document[0].filename}`);
      }
      
      if (req.files?.driving_license_document?.[0]) {
        // Delete old file if it exists
        if (employee.driving_license_document_path) {
          const oldFilePath = path.join(__dirname, '..', employee.driving_license_document_path);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        updates.push(`driving_license_document_path = $${paramCount++}`);
        values.push(`/uploads/employee-ids/${req.files.driving_license_document[0].filename}`);
      }

      if (updates.length === 0) {
        if (req.files) {
          Object.values(req.files).flat().forEach(file => {
            if (file && file.path) fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(req.params.id);
      const query = `UPDATE employees SET ${updates.join(', ')} WHERE id = $${paramCount}`;

      await db.query(query, values);

      const updatedResult = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
      
      res.json({ employee: updatedResult.rows[0] });
    } catch (error) {
      console.error('Error in PUT /api/employees/:id:', error);
      // Delete uploaded files if database update fails
      if (req.files) {
        Object.values(req.files).flat().forEach(file => {
          if (file && file.path) {
            try {
              fs.unlinkSync(file.path);
            } catch (unlinkErr) {
              console.error('Error deleting uploaded file:', unlinkErr);
            }
          }
        });
      }
      res.status(500).json({ error: 'Error updating employee: ' + error.message });
    }
  }
);

// Mark employee inactive (soft delete) - moves to past employees (admin, branch admin, or night manager for riders)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'branch_admin' && req.user.role !== 'night_manager') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDb();

    const employeeResult = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (req.user.role === 'branch_admin') {
      const branchId = await resolveEffectiveBranchId(db, req.user);
      if (!branchId) {
        return res.status(403).json({ error: 'Branch admin must be assigned to a branch' });
      }
      if (employeeResult.rows[0].branch_id !== branchId) {
        return res.status(403).json({ error: 'You can only mark inactive employees in your own branch' });
      }
    }
    if (req.user.role === 'night_manager') {
      const branchId = await resolveEffectiveBranchId(db, req.user);
      if (!branchId) {
        return res.status(403).json({ error: 'Night manager must be assigned to a branch' });
      }
      if (
        employeeResult.rows[0].branch_id !== branchId ||
        employeeResult.rows[0].post?.toLowerCase() !== 'rider'
      ) {
        return res.status(403).json({ error: 'Night manager can only mark inactive riders in own branch' });
      }
    }

    await db.query('UPDATE employees SET is_active = 0, in_payroll = 0 WHERE id = $1', [req.params.id]);
    
    res.json({ message: 'Employee moved to past employees' });
  } catch (error) {
    console.error('Error in DELETE /api/employees/:id:', error);
    res.status(500).json({ error: 'Error deleting employee: ' + error.message });
  }
});

// Get transportation recipients (active employees who receive transportation)
router.get('/transportation/recipients', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const conditions = ['receives_transportation = 1', 'is_active = 1'];
    const params = [];

    if (req.user.role === 'branch_admin' || req.user.role === 'night_manager') {
      const branchId = await resolveEffectiveBranchId(db, req.user);
      if (!branchId) {
        return res.status(403).json({ error: 'User must be assigned to a branch' });
      }
      params.push(branchId);
      conditions.push(`branch_id = $${params.length}`);
    }

    const result = await db.query(
      `SELECT id, name
       FROM employees
       WHERE ${conditions.join(' AND ')}
       ORDER BY name`,
      params
    );
    res.json({ employees: result.rows });
  } catch (error) {
    console.error('Error in GET /api/employees/transportation/recipients:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

module.exports = router;
