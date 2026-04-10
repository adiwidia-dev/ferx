type WithId = {
  id: string;
};

export function moveItemToTarget<T extends WithId>(
  items: T[],
  sourceId: string,
  targetId: string,
): T[] {
  if (sourceId === targetId) {
    return items;
  }

  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return items;
  }

  const reorderedItems = [...items];
  const [movedItem] = reorderedItems.splice(sourceIndex, 1);
  reorderedItems.splice(targetIndex, 0, movedItem);

  return reorderedItems;
}
