using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace gamersremorse;

public static class DbContextExtensions
{
    public static void Upsert<T>(this DbContext db, T entity) where T : class
    {
        var entry = db.Entry(entity);
        var keyValues = GetKeyValues(entry);
        var found = db.Set<T>().Find(keyValues);
        if (found != null)
            db.Entry(found).State = EntityState.Detached; // detach the one Find() loaded
        entry.State = found != null ? EntityState.Modified : EntityState.Added;
    }

    public static void UpsertRange<T>(this DbContext db, IEnumerable<T> entities) where T : class
    {
        foreach (var entity in entities)
            db.Upsert(entity);
    }

    private static object?[] GetKeyValues<T>(EntityEntry<T> entry) where T : class
    {
        var keyProperties = entry.Metadata.FindPrimaryKey()!.Properties;
        return keyProperties.Select(p => entry.Property(p.Name).CurrentValue).ToArray();
    }
}
