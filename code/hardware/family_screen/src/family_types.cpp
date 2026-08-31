#include "family_types.h"
#include <string.h>

namespace family {
bool PageDescriptor::displayContentMatches(const PageDescriptor& other) const {
  // The revision may change without changing any pixels. Refresh only for
  // fields that affect what is shown or how the visible page behaves.
  return strcmp(label, other.label) == 0 &&
         strcmp(sha256, other.sha256) == 0 &&
         kind == other.kind;
}
int PageManifest::find(const char* pageId) const {
  if (!pageId) return -1;
  for (uint8_t i = 0; i < count; ++i) if (strcmp(pages[i].id, pageId) == 0) return i;
  return -1;
}
int PageManifest::drawingIndex() const {
  for (uint8_t i = 0; i < count; ++i) if (pages[i].kind == PageKind::Drawing) return i;
  return -1;
}
}  // namespace family
