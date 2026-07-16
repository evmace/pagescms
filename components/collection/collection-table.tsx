"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  useReactTable,
  RowData,
  ExpandedState,
  Row
} from "@tanstack/react-table"
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Loader, CircleMinus, CirclePlus, Folder, FolderOpen, GripVertical } from "lucide-react";

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

export type TableData = {
  name: string;
  path: string;
  sha?: string;
  content?: string;
  object?: Record<string, any>;
  type: "file" | "dir";
  isNode?: boolean;
  parentPath?: string;
  subRows?: TableData[];
  fields?: Record<string, any>;
}

const LShapeIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M4 4V11C4 12.0609 4.42143 13.0783 5.17157 13.8284C5.92172 14.5786 6.93913 15 8 15H20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"/>
  </svg>
);

function CollectionTableRow<TData extends TableData>({
  row,
  columns,
  isTree,
  primaryField,
  pathname,
  loadingRows,
  handleRowExpansion,
  canDrag,
  reorderable,
}: {
  row: Row<TData>;
  columns: any[];
  isTree: boolean;
  primaryField?: string;
  pathname: string;
  loadingRows: Record<string, boolean>;
  handleRowExpansion: (row: Row<TData>) => void;
  canDrag: boolean;
  reorderable: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: !canDrag });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={isDragging ? "relative z-10 bg-background" : undefined}
    >
      {reorderable && (
        <TableCell className="p-2 border-b py-0 h-12 w-8">
          {canDrag && (
            <button
              type="button"
              className="flex items-center justify-center h-8 w-8 -m-2 touch-none cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
              <span className="sr-only">Drag to reorder</span>
            </button>
          )}
        </TableCell>
      )}
      {
        row.original.type === "dir"
          ? <>
            <TableCell
              colSpan={columns.length - 1}
              className="p-2 border-b py-0 h-12"
              style={{
                paddingLeft: row.depth > 0
                  ? `${row.depth * 2}rem`
                  : undefined
              }}
            >
              {isTree
                ? <button
                    className="flex items-center gap-x-2 font-medium"
                    onClick={() => handleRowExpansion(row as Row<TData>)}
                  >
                    {loadingRows[row.id]
                      ? <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
                      : row.getIsExpanded()
                        ? <FolderOpen className="h-4 w-4" />
                        : <Folder className="h-4 w-4" />
                    }
                    {row.original.name}
                  </button>
                : <Link
                    className="flex items-center gap-x-2 font-medium"
                    href={`${pathname}?path=${encodeURIComponent(row.original.path)}`}
                  >
                    <Folder className="h-4 w-4" />
                    {row.original.name}
                  </Link>
              }
            </TableCell>
            <TableCell className="p-2 border-b py-0 h-12">
              {
                (() => {
                  const lastCell = row.getVisibleCells()[row.getVisibleCells().length - 1];
                  return flexRender(lastCell.column.columnDef.cell, lastCell.getContext());
                })()
              }
            </TableCell>
            </>
          : row.getVisibleCells().map((cell, index) => (
            <TableCell
              key={cell.id}
              className={cn(
                "p-2 border-b py-0 h-12",
                cell.column.columnDef.meta?.className,
              )}
              style={{
                paddingLeft: (cell.column.id === primaryField && row.depth > 0)
                  ? `${row.depth * 1.5}rem`
                  : undefined
              }}
            >
              <div className="flex items-center gap-x-1">
                {row.depth > 0 && cell.column.id === primaryField && <LShapeIcon className="h-4 w-4 text-muted-foreground opacity-50"/>}
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                {isTree && row.getCanExpand() && cell.column.id === primaryField && (
                  loadingRows[row.id]
                    ? <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-full" disabled>
                        <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
                      </Button>
                    : <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-6 w-6 rounded-full"
                        onClick={() => handleRowExpansion(row as Row<TData>)}
                        disabled={row.getIsExpanded() && Array.isArray(row.original.subRows) && row.original.subRows.length === 0}
                      >
                        {row.getIsExpanded() ? <CircleMinus className="text-muted-foreground hover:text-foreground h-4 w-4" /> : <CirclePlus className="text-muted-foreground hover:text-foreground h-4 w-4" />}
                        <span className="sr-only">{row.getIsExpanded() ? 'Collapse row' : 'Expand row'}</span>
                      </Button>
                )}

              </div>
            </TableCell>
          ))
      }
    </TableRow>
  );
}

export function CollectionTable<TData extends TableData>({
  columns,
  data,
  initialState,
  search,
  setSearch,
  onExpand,
  pathname,
  path,
  isTree = false,
  defaultExpandAll = false,
  primaryField,
  reorderable = false,
  onReorder,
}: {
  columns: any[],
  data: Record<string, any>[],
  initialState?: Record<string, any>,
  search: string,
  setSearch: (value: string) => void,
  onExpand: (row: any) => Promise<any>,
  pathname: string,
  path: string,
  isTree?: boolean,
  defaultExpandAll?: boolean,
  primaryField?: string,
  reorderable?: boolean,
  onReorder?: (paths: string[]) => void,
}) {
  const [expanded, setExpanded] = useState<ExpandedState>(defaultExpandAll ? true : {});

  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  const loadingPathSetRef = useRef<Set<string>>(new Set());

  const handleRowExpansion = useCallback(async (row: Row<TData>) => {
    const needsLoading = row.getCanExpand() && !row.getIsExpanded() && row.original.subRows === undefined;
    const loadPath = row.original.isNode ? row.original.parentPath : row.original.path;

    if (needsLoading) {
      if (!loadPath) return;
      if (loadingPathSetRef.current.has(loadPath)) return;

      loadingPathSetRef.current.add(loadPath);
      setLoadingRows(prev => ({ ...prev, [row.id]: true }));
      try {
        await onExpand(row.original);
      } catch (error) {
        console.error("onExpand failed for row:", row.id, error);
        setLoadingRows(prev => {
          const newState = { ...prev };
          delete newState[row.id];
          return newState;
        });
        return;
      } finally {
        loadingPathSetRef.current.delete(loadPath);
        setLoadingRows(prev => {
          const newState = { ...prev };
          delete newState[row.id];
          return newState;
        });
      }
    }
    row.toggleExpanded();
  }, [onExpand]);

  const table = useReactTable({
    data,
    columns,
    getRowId: (row: any) => row.path,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState,
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) => row.original.isNode || row.original.type === "dir",
    getSubRows: (row) => row.subRows,
    state: {
      globalFilter: search,
      expanded,
    },
    onGlobalFilterChange: setSearch,
    onExpandedChange: setExpanded,
  });

  const currentPage = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  const paginationItems = (() => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, i) => i);
    }

    const pages = new Set<number>([0, pageCount - 1, currentPage]);
    if (currentPage - 1 >= 0) pages.add(currentPage - 1);
    if (currentPage + 1 < pageCount) pages.add(currentPage + 1);

    const ordered = Array.from(pages).sort((a, b) => a - b);
    const items: Array<number | "ellipsis"> = [];

    for (let i = 0; i < ordered.length; i += 1) {
      if (i > 0 && ordered[i] - ordered[i - 1] > 1) {
        items.push("ellipsis");
      }
      items.push(ordered[i]);
    }

    return items;
  })();

  useEffect(() => {
    if (!isTree) return;

    table.getRowModel().rows.forEach((row) => {
      if (
        !row.getIsExpanded() &&
        (
          (row.original.isNode && row.original.parentPath && path.startsWith(row.original.parentPath)) ||
          (row.original.type === "dir" && path.startsWith(row.original.path))
        )
      ) {
        handleRowExpansion(row as Row<TData>);
      }
    });
  }, [isTree, path, handleRowExpansion, table, data]);

  // Reordering is scoped to siblings only: one group for every depth-0 row,
  // and one separate group per parent for its immediately-following depth-1
  // rows (nestBy groups are exactly one level deep -- see collection.tsx's
  // nestedData memo). Rendering the flattened+expanded row model always puts
  // a parent immediately before its own children, so a single linear walk is
  // enough to derive each group's ordered id list.
  const rows = table.getRowModel().rows;
  const { rootGroup, childGroupByParentId, parentIdByChildId } = useMemo(() => {
    const rootIds: string[] = [];
    const childGroups = new Map<string, string[]>();
    const parentByChild = new Map<string, string>();
    let currentParentId: string | null = null;

    rows.forEach((row) => {
      if (row.depth === 0) {
        rootIds.push(row.id);
        currentParentId = row.id;
        if (!childGroups.has(row.id)) childGroups.set(row.id, []);
      } else if (row.depth === 1 && currentParentId) {
        childGroups.get(currentParentId)!.push(row.id);
        parentByChild.set(row.id, currentParentId);
      }
    });

    return { rootGroup: rootIds, childGroupByParentId: childGroups, parentIdByChildId: parentByChild };
  }, [rows]);

  const canReorder = reorderable && !search;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!canReorder || !onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const parentId = parentIdByChildId.get(activeId);
    const group = parentId ? childGroupByParentId.get(parentId) : rootGroup;
    if (!group || !group.includes(overId)) return;

    const oldIndex = group.indexOf(activeId);
    const newIndex = group.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(group, oldIndex, newIndex));
  }, [canReorder, onReorder, rootGroup, childGroupByParentId, parentIdByChildId]);

  const renderRow = (row: Row<TData>) => {
    const group = row.depth === 1
      ? (childGroupByParentId.get(parentIdByChildId.get(row.id) ?? "") ?? [])
      : rootGroup;
    const canDrag = canReorder && row.original.type === "file" && group.includes(row.id);

    return (
      <CollectionTableRow
        key={row.id}
        row={row}
        columns={columns}
        isTree={isTree}
        primaryField={primaryField}
        pathname={pathname}
        loadingRows={loadingRows}
        handleRowExpansion={handleRowExpansion}
        canDrag={canDrag}
        reorderable={reorderable}
      />
    );
  };

  // Walk the flattened rows once, rendering each depth-0 (parent/top-level)
  // row directly under the outer rootGroup context, then wrapping the run of
  // depth-1 rows immediately following it (its children, per the flattening
  // order) in their own separate SortableContext -- the children, not the
  // parent, are what that inner context needs to scope.
  const renderReorderableRows = () => {
    const nodes: React.ReactNode[] = [];
    let i = 0;
    while (i < rows.length) {
      const row = rows[i];
      if (row.depth !== 0) {
        nodes.push(renderRow(row));
        i += 1;
        continue;
      }

      nodes.push(renderRow(row));
      i += 1;

      const childIds = childGroupByParentId.get(row.id);
      if (childIds && childIds.length > 0) {
        const childRows: Row<TData>[] = [];
        while (i < rows.length && rows[i].depth === 1) {
          childRows.push(rows[i]);
          i += 1;
        }
        nodes.push(
          <SortableContext
            key={`${row.id}-group`}
            items={childIds}
            strategy={verticalListSortingStrategy}
          >
            {childRows.map((childRow) => renderRow(childRow))}
          </SortableContext>,
        );
      }
    }
    return nodes;
  };

  const tableBody = (
    <TableBody>
      {rows?.length ? (
        canReorder ? (
          <DndContext
            sensors={sensors}
            modifiers={[restrictToVerticalAxis]}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rootGroup} strategy={verticalListSortingStrategy}>
              {renderReorderableRows()}
            </SortableContext>
          </DndContext>
        ) : (
          rows.map((row) => renderRow(row))
        )
      ) : (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columns.length + (reorderable ? 1 : 0)} className="text-center text-muted-foreground text-sm p-6">
            <span>No entries</span>
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );

  return (
    <div className="space-y-2">
      <Table className="border-separate border-spacing-0 text-sm">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="sticky -top-4 md:-top-6 z-20 bg-background hover:bg-background">
              {reorderable && <TableHead className="p-2 h-10 border-b w-8" />}
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "p-2 h-10 border-b hover:bg-muted/50 cursor-pointer select-none last:cursor-default last:hover:bg-background truncate",
                      header.column.columnDef.meta?.className
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                    title={
                      header.column.getCanSort()
                        ? header.column.getNextSortingOrder() === 'asc'
                          ? 'Sort ascending'
                          : header.column.getNextSortingOrder() === 'desc'
                            ? 'Sort descending'
                            : 'Clear sort'
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-x-2">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {{
                        asc: <ArrowUp className="h-4 w-4 opacity-50"/>,
                        desc: <ArrowDown className="xh-4 w-4 opacity-50"/>,
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        {tableBody}
      </Table>
      {pageCount > 1 && (
        <footer className="flex items-center justify-end">
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  iconOnly
                  onClick={(event) => {
                    event.preventDefault();
                    if (table.getCanPreviousPage()) table.previousPage();
                  }}
                  className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              {paginationItems.map((item, index) => (
                <PaginationItem key={`${item}-${index}`}>
                  {item === "ellipsis" ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href="#"
                      isActive={item === currentPage}
                      onClick={(event) => {
                        event.preventDefault();
                        table.setPageIndex(item);
                      }}
                    >
                      {item + 1}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  iconOnly
                  onClick={(event) => {
                    event.preventDefault();
                    if (table.getCanNextPage()) table.nextPage();
                  }}
                  className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </footer>
      )}
    </div>
  )
}
