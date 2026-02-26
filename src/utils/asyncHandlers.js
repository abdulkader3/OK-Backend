const asyncHandlers = (reqHandler) => {
  return (req, res, next) => {
    Promise.resolve(reqHandler(req, res, next)).catch(next);
  };
};

const asyncHandler = asyncHandlers;

export { asyncHandlers, asyncHandler };
