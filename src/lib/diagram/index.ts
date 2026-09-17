/**
 * DiagramDesign — Visual Architecture & Flow Mapping
 *
 * Generates Mermaid diagrams from crawled webbuilder data:
 * user journeys, component trees, data flows, architecture,
 * state machines, ER diagrams, and route maps.
 */
export {
  DiagramGenerator,
  getDiagramGenerator,
  type DiagramType,
  type DiagramNode,
  type DiagramEdge,
  type Diagram,
} from "./generator";
