/**
 * Normalized AST node type constants.
 *
 * These string constants define the node types that rules can
 * register visitors for. They are parser-agnostic — both SWC
 * and tree-sitter nodes are mapped to these types.
 */

// =============================================================================
// Module-level nodes
// =============================================================================

export const MODULE = 'Module';
export const IMPORT_DECLARATION = 'ImportDeclaration';
export const EXPORT_DECLARATION = 'ExportDeclaration';
export const EXPORT_DEFAULT_DECLARATION = 'ExportDefaultDeclaration';
export const EXPORT_NAMED_DECLARATION = 'ExportNamedDeclaration';

// =============================================================================
// Statement nodes
// =============================================================================

export const VARIABLE_DECLARATION = 'VariableDeclaration';
export const FUNCTION_DECLARATION = 'FunctionDeclaration';
export const CLASS_DECLARATION = 'ClassDeclaration';
export const IF_STATEMENT = 'IfStatement';
export const SWITCH_STATEMENT = 'SwitchStatement';
export const FOR_STATEMENT = 'ForStatement';
export const FOR_IN_STATEMENT = 'ForInStatement';
export const FOR_OF_STATEMENT = 'ForOfStatement';
export const WHILE_STATEMENT = 'WhileStatement';
export const DO_WHILE_STATEMENT = 'DoWhileStatement';
export const TRY_STATEMENT = 'TryStatement';
export const CATCH_CLAUSE = 'CatchClause';
export const THROW_STATEMENT = 'ThrowStatement';
export const RETURN_STATEMENT = 'ReturnStatement';
export const BLOCK_STATEMENT = 'BlockStatement';
export const EXPRESSION_STATEMENT = 'ExpressionStatement';

// =============================================================================
// Expression nodes
// =============================================================================

export const CALL_EXPRESSION = 'CallExpression';
export const NEW_EXPRESSION = 'NewExpression';
export const MEMBER_EXPRESSION = 'MemberExpression';
export const ASSIGNMENT_EXPRESSION = 'AssignmentExpression';
export const BINARY_EXPRESSION = 'BinaryExpression';
export const UNARY_EXPRESSION = 'UnaryExpression';
export const CONDITIONAL_EXPRESSION = 'ConditionalExpression';
export const TEMPLATE_LITERAL = 'TemplateLiteral';
export const TAGGED_TEMPLATE_EXPRESSION = 'TaggedTemplateExpression';
export const ARROW_FUNCTION_EXPRESSION = 'ArrowFunctionExpression';
export const FUNCTION_EXPRESSION = 'FunctionExpression';
export const OBJECT_EXPRESSION = 'ObjectExpression';
export const ARRAY_EXPRESSION = 'ArrayExpression';
export const SPREAD_ELEMENT = 'SpreadElement';
export const AWAIT_EXPRESSION = 'AwaitExpression';

// =============================================================================
// Literal nodes
// =============================================================================

export const STRING_LITERAL = 'StringLiteral';
export const NUMERIC_LITERAL = 'NumericLiteral';
export const BOOLEAN_LITERAL = 'BooleanLiteral';
export const NULL_LITERAL = 'NullLiteral';
export const REGEXP_LITERAL = 'RegExpLiteral';

// =============================================================================
// Pattern / identifier nodes
// =============================================================================

export const IDENTIFIER = 'Identifier';
export const OBJECT_PATTERN = 'ObjectPattern';
export const ARRAY_PATTERN = 'ArrayPattern';
export const REST_ELEMENT = 'RestElement';

// =============================================================================
// TypeScript-specific nodes
// =============================================================================

export const TS_TYPE_ANNOTATION = 'TSTypeAnnotation';
export const TS_INTERFACE_DECLARATION = 'TSInterfaceDeclaration';
export const TS_TYPE_ALIAS_DECLARATION = 'TSTypeAliasDeclaration';
export const TS_ENUM_DECLARATION = 'TSEnumDeclaration';
export const TS_AS_EXPRESSION = 'TSAsExpression';

// =============================================================================
// Comment nodes
// =============================================================================

export const COMMENT = 'Comment';
export const LINE_COMMENT = 'LineComment';
export const BLOCK_COMMENT = 'BlockComment';
