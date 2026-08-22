
const sanitizeBigInt = (value) => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeBigInt);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeBigInt(v);
    return out;
  }
  return value;
};

const successResponse = (res, message, statusCode = 200, data = null) => {
  const response = {
    status: true,
    message,
  };

  if (data !== null) {
    response.data = sanitizeBigInt(data);
  }

  return res.status(statusCode).json(response);
};


const errorResponse = (res, message = "Something went wrong", statusCode = 500, status = false) => {
  return res.status(statusCode).json({
    status: status,
    message,
  });
};

const ApperrorResponses = (res, message = "Something went wrong", statusCode = 500, status = false) => {
  return res.status(statusCode).json({
    status: status,
    message,
  });
};

const validationErrorResponse = (res, errors, message = "Validation Failed", statusCode = 400) => {
  return res.status(statusCode).json({
    status: false,
    message,
    errors,
  });
};

module.exports = {
  successResponse,
  errorResponse,
  validationErrorResponse,
  ApperrorResponses
};
